package com.qumemo.app

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.util.Log
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * Minimal ASR test activity.
 *
 * Flow: Load model -> Record mic audio -> Transcribe with whisper.cpp -> Display Arabic text
 *
 * This is Phase 1: standalone quality test. No web integration yet.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "QumemoASR"
        private const val SAMPLE_RATE = 16000
        private const val REQUEST_MIC = 1001

        // Model filename — place the GGML file in app/src/main/assets/models/
        // To use generic whisper-base for initial testing, change to "ggml-base.bin"
        private const val MODEL_FILENAME = "ggml-tarteel-base-q5_1.bin"
    }

    // UI
    private lateinit var tvStatus: TextView
    private lateinit var tvResult: TextView
    private lateinit var tvDuration: TextView
    private lateinit var btnRecord: MaterialButton
    private lateinit var btnTranscribe: MaterialButton

    // Whisper
    private var whisperCtx: Long = 0

    // Recording
    private var audioRecord: AudioRecord? = null
    private var isRecording = false
    private val pcmChunks = mutableListOf<ShortArray>()
    private var recordingThread: Thread? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvStatus = findViewById(R.id.tvStatus)
        tvResult = findViewById(R.id.tvResult)
        tvDuration = findViewById(R.id.tvDuration)
        btnRecord = findViewById(R.id.btnRecord)
        btnTranscribe = findViewById(R.id.btnTranscribe)

        btnRecord.setOnClickListener { toggleRecording() }
        btnTranscribe.setOnClickListener { transcribe() }

        // Request mic permission, then load model
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MIC)
        } else {
            loadModel()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_MIC && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            loadModel()
        } else {
            tvStatus.text = "Microphone permission required"
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (whisperCtx != 0L) {
            WhisperLib.freeModel(whisperCtx)
            whisperCtx = 0
        }
    }

    // ── Model loading ────────────────────────────────────

    private fun loadModel() {
        tvStatus.text = getString(R.string.status_loading)

        lifecycleScope.launch {
            val modelPath = withContext(Dispatchers.IO) {
                copyAssetToInternal(MODEL_FILENAME)
            }

            if (modelPath == null) {
                tvStatus.text = "ERROR: Model not found"
                tvResult.text = "Place $MODEL_FILENAME in\nassets/models/ and rebuild"
                return@launch
            }

            tvStatus.text = "Loading model (may take ~10s)..."

            val ctx = withContext(Dispatchers.IO) {
                try {
                    WhisperLib.initModel(modelPath)
                } catch (e: Exception) {
                    Log.e(TAG, "initModel crashed: ${e.message}", e)
                    0L
                }
            }

            if (ctx == 0L) {
                tvStatus.text = "ERROR: Model failed to load"
                tvResult.text = "Model file may be corrupted.\nTry deleting app data and rebuilding."
                return@launch
            }

            whisperCtx = ctx
            val modelSize = File(modelPath).length() / 1_000_000
            tvStatus.text = "Ready (model: ${modelSize}MB)"
            btnRecord.isEnabled = true
            Log.i(TAG, "Model loaded: $modelPath (${modelSize}MB)")
        }
    }

    /**
     * Copy model from assets/models/ to internal storage (whisper.cpp needs a file path).
     * Returns the path, or null if the asset doesn't exist.
     */
    private fun copyAssetToInternal(filename: String): String? {
        val outFile = File(filesDir, filename)

        // If cached, verify it's not corrupted (size > 1MB)
        if (outFile.exists()) {
            if (outFile.length() > 1_000_000) {
                Log.i(TAG, "Model cached: ${outFile.absolutePath} (${outFile.length() / 1_000_000}MB)")
                return outFile.absolutePath
            }
            // Corrupted/empty cache — delete and re-copy
            Log.w(TAG, "Cached model too small (${outFile.length()} bytes), re-copying")
            outFile.delete()
        }

        return try {
            assets.open("models/$filename").use { input ->
                FileOutputStream(outFile).use { output ->
                    val bytes = input.copyTo(output)
                    Log.i(TAG, "Model copied: ${outFile.absolutePath} ($bytes bytes)")
                }
            }
            outFile.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy model: ${e.message}")
            null
        }
    }

    // ── Recording ────────────────────────────────────────

    private fun toggleRecording() {
        if (isRecording) {
            stopRecording()
        } else {
            startRecording()
        }
    }

    private fun startRecording() {
        val bufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) return

        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        )

        if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
            tvStatus.text = "ERROR: AudioRecord failed to initialize"
            tvResult.text = "Mic may be in use by another app"
            audioRecord?.release()
            audioRecord = null
            return
        }

        pcmChunks.clear()
        isRecording = true
        audioRecord?.startRecording()

        btnRecord.text = getString(R.string.btn_stop)
        btnTranscribe.isEnabled = false
        tvStatus.text = getString(R.string.status_recording)
        tvResult.text = ""

        // Read audio in a background thread
        recordingThread = Thread {
            val buffer = ShortArray(SAMPLE_RATE) // 1 second chunks
            while (isRecording) {
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                if (read > 0) {
                    pcmChunks.add(buffer.copyOf(read))

                    // Update duration on UI thread
                    val totalSamples = pcmChunks.sumOf { it.size }
                    val seconds = totalSamples.toFloat() / SAMPLE_RATE
                    runOnUiThread {
                        tvDuration.text = "%.1fs".format(seconds)
                    }
                }
            }
        }.also { it.start() }
    }

    private fun stopRecording() {
        isRecording = false
        recordingThread?.join(1000)
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null

        btnRecord.text = getString(R.string.btn_record)
        btnTranscribe.isEnabled = pcmChunks.isNotEmpty()
        tvStatus.text = getString(R.string.status_idle)
    }

    // ── Transcription ────────────────────────────────────

    private fun transcribe() {
        if (whisperCtx == 0L || pcmChunks.isEmpty()) return

        btnRecord.isEnabled = false
        btnTranscribe.isEnabled = false

        lifecycleScope.launch {
            val floatSamples = withContext(Dispatchers.Default) {
                val totalSamples = pcmChunks.sumOf { it.size }
                val merged = FloatArray(totalSamples)
                var offset = 0
                for (chunk in pcmChunks) {
                    for (s in chunk) {
                        merged[offset++] = s.toFloat() / Short.MAX_VALUE
                    }
                }
                merged
            }

            val audioDuration = floatSamples.size.toFloat() / SAMPLE_RATE
            tvStatus.text = "Transcribing %.1fs audio...".format(audioDuration)
            Log.i(TAG, "Starting transcription: ${floatSamples.size} samples (${audioDuration}s)")

            // Elapsed timer — update UI every second while transcribing
            val startMs = System.currentTimeMillis()
            var timerRunning = true
            launch {
                while (timerRunning) {
                    kotlinx.coroutines.delay(1000)
                    if (timerRunning) {
                        val elapsed = (System.currentTimeMillis() - startMs) / 1000
                        tvStatus.text = "Transcribing %.1fs audio... (%ds)".format(audioDuration, elapsed)
                    }
                }
            }

            try {
                val text = withContext(Dispatchers.IO) {
                    WhisperLib.transcribeAudio(
                        whisperCtx,
                        floatSamples,
                        "ar",     // Arabic
                        1         // beam_size=1 (greedy) — faster for PoC testing
                    )
                }

                timerRunning = false
                val elapsedMs = System.currentTimeMillis() - startMs

                Log.i(TAG, "Transcription took ${elapsedMs}ms, result: '$text'")

                if (text.isBlank()) {
                    tvResult.text = "No speech detected (empty result)"
                    tvStatus.text = "Empty result after ${elapsedMs}ms"
                } else {
                    tvResult.text = text.trim()
                    tvStatus.text = "Done in ${elapsedMs}ms (%.1fs audio)".format(audioDuration)
                }
            } catch (e: Exception) {
                timerRunning = false
                Log.e(TAG, "Transcription failed", e)
                tvResult.text = "ERROR: ${e.message}\n\n${e.javaClass.simpleName}"
                tvStatus.text = "Transcription failed"
            }

            btnRecord.isEnabled = true
            btnTranscribe.isEnabled = true
        }
    }
}
