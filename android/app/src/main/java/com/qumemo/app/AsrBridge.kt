package com.qumemo.app

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView

/**
 * JavaScript bridge for on-device ASR via whisper.cpp.
 *
 * Kotlin side: registered as window.__AndroidAsrBridge in WebView.
 * JS side: AndroidBridgeBackend in asrBackends.ts calls start()/stop().
 *
 * Streaming approach:
 *   1. AudioRecord captures 16kHz mono PCM continuously
 *   2. Every TRANSCRIBE_INTERVAL_MS, transcribe the last WINDOW_SECONDS of audio
 *   3. Emit result to JS via window.__asrCallback(text, isFinal)
 *   4. On stop(), emit one final transcription
 */
class AsrBridge(
    private val webView: WebView,
    private val whisperCtx: Long
) {
    companion object {
        private const val TAG = "AsrBridge"
        private const val SAMPLE_RATE = 16000
        private const val TRANSCRIBE_INTERVAL_MS = 2000L
        private const val WINDOW_SECONDS = 10.0f  // Transcribe last 10s of audio
    }

    @Volatile private var isRecording = false
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private var transcriptionThread: Thread? = null

    // Accumulated PCM samples (thread-safe access via synchronized)
    private val pcmBuffer = mutableListOf<Short>()

    @JavascriptInterface
    fun start() {
        if (isRecording) return
        Log.i(TAG, "Starting streaming ASR")

        val bufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            )
        } catch (e: SecurityException) {
            emitError("Microphone permission not granted")
            return
        }

        if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
            emitError("AudioRecord failed to initialize")
            audioRecord?.release()
            audioRecord = null
            return
        }

        synchronized(pcmBuffer) { pcmBuffer.clear() }
        isRecording = true
        audioRecord?.startRecording()

        // Recording thread: continuously reads mic into pcmBuffer
        recordingThread = Thread {
            val buffer = ShortArray(SAMPLE_RATE / 2) // 0.5s chunks
            while (isRecording) {
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                if (read > 0) {
                    synchronized(pcmBuffer) {
                        for (i in 0 until read) {
                            pcmBuffer.add(buffer[i])
                        }
                    }
                }
            }
        }.also { it.start() }

        // Transcription thread: transcribes every TRANSCRIBE_INTERVAL_MS
        transcriptionThread = Thread {
            Thread.sleep(TRANSCRIBE_INTERVAL_MS) // Initial delay
            while (isRecording) {
                transcribeWindow(isFinal = false)
                Thread.sleep(TRANSCRIBE_INTERVAL_MS)
            }
        }.also { it.start() }

        Log.i(TAG, "Streaming ASR started")
    }

    @JavascriptInterface
    fun stop() {
        if (!isRecording) return
        Log.i(TAG, "Stopping streaming ASR")

        isRecording = false
        recordingThread?.join(2000)
        transcriptionThread?.join(2000)

        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null

        // Final transcription of everything remaining
        transcribeWindow(isFinal = true)

        synchronized(pcmBuffer) { pcmBuffer.clear() }
        Log.i(TAG, "Streaming ASR stopped")
    }

    @JavascriptInterface
    fun isAvailable(): Boolean = whisperCtx != 0L

    /**
     * Transcribe the last WINDOW_SECONDS of accumulated audio.
     */
    private fun transcribeWindow(isFinal: Boolean) {
        val samples: FloatArray
        synchronized(pcmBuffer) {
            if (pcmBuffer.isEmpty()) return

            val windowSamples = (WINDOW_SECONDS * SAMPLE_RATE).toInt()
            val startIdx = maxOf(0, pcmBuffer.size - windowSamples)
            val slice = pcmBuffer.subList(startIdx, pcmBuffer.size)

            samples = FloatArray(slice.size) { slice[it].toFloat() / Short.MAX_VALUE }
        }

        if (samples.size < SAMPLE_RATE / 2) return // Skip if less than 0.5s

        val startMs = System.currentTimeMillis()
        val text = try {
            WhisperLib.transcribeAudio(whisperCtx, samples, "ar", 1)
        } catch (e: Exception) {
            Log.e(TAG, "Transcription error", e)
            emitError("Transcription failed: ${e.message}")
            return
        }
        val elapsedMs = System.currentTimeMillis() - startMs

        val trimmed = text.trim()
        if (trimmed.isNotEmpty()) {
            Log.i(TAG, "${if (isFinal) "FINAL" else "interim"} (${elapsedMs}ms): $trimmed")
            emitResult(trimmed, isFinal)
        }
    }

    private fun emitResult(text: String, isFinal: Boolean) {
        val escaped = text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
        val js = "window.__asrCallback && window.__asrCallback('$escaped', $isFinal)"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun emitError(error: String) {
        val escaped = error.replace("\\", "\\\\").replace("'", "\\'")
        val js = "window.__asrErrorCallback && window.__asrErrorCallback('$escaped')"
        webView.post { webView.evaluateJavascript(js, null) }
    }
}
