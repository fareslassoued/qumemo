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
                tvStatus.text = "Model not found: $MODEL_FILENAME\nPlace it in assets/models/"
                return@launch
            }

            val ctx = withContext(Dispatchers.IO) {
                WhisperLib.initModel(modelPath)
            }

            if (ctx == 0L) {
                tvStatus.text = "Failed to load model"
                return@launch
            }

            whisperCtx = ctx
            tvStatus.text = getString(R.string.status_idle)
            btnRecord.isEnabled = true
            Log.i(TAG, "Model loaded: $modelPath")
        }
    }

    /**
     * Copy model from assets/models/ to internal storage (whisper.cpp needs a file path).
     * Returns the path, or null if the asset doesn't exist.
     */
    private fun copyAssetToInternal(filename: String): String? {
        val outFile = File(filesDir, filename)
        if (outFile.exists()) {
            Log.i(TAG, "Model already cached: ${outFile.absolutePath}")
            return outFile.absolutePath
        }

        return try {
            assets.open("models/$filename").use { input ->
                FileOutputStream(outFile).use { output ->
                    input.copyTo(output)
                }
            }
            Log.i(TAG, "Model copied to: ${outFile.absolutePath}")
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

        tvStatus.text = getString(R.string.status_transcribing)
        btnRecord.isEnabled = false
        btnTranscribe.isEnabled = false

        lifecycleScope.launch {
            val floatSamples = withContext(Dispatchers.Default) {
                // Merge all chunks into one float array ([-1..1] range)
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

            val startMs = System.currentTimeMillis()

            val text = withContext(Dispatchers.IO) {
                WhisperLib.transcribeAudio(
                    whisperCtx,
                    floatSamples,
                    "ar",     // Arabic
                    5         // beam_size — matches server.py
                )
            }

            val elapsedMs = System.currentTimeMillis() - startMs
            val audioDuration = floatSamples.size.toFloat() / SAMPLE_RATE

            Log.i(TAG, "Transcription took ${elapsedMs}ms for ${audioDuration}s audio (${elapsedMs / (audioDuration * 1000) * 100}% realtime)")

            tvResult.text = text.trim()
            tvStatus.text = "Done in ${elapsedMs}ms (${audioDuration.let { "%.1fs".format(it) }} audio)"
            btnRecord.isEnabled = true
            btnTranscribe.isEnabled = true
        }
    }
}
