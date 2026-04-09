package com.qumemo.app

/**
 * JNI bridge to whisper.cpp.
 *
 * Usage:
 *   val ptr = WhisperLib.initModel("/path/to/model.bin")
 *   val text = WhisperLib.transcribeAudio(ptr, floatSamples, "ar", 5)
 *   WhisperLib.freeModel(ptr)
 */
object WhisperLib {

    init {
        System.loadLibrary("whisper_jni")
    }

    /** Load a GGML model file. Returns a native pointer (0 on failure). */
    external fun initModel(modelPath: String): Long

    /**
     * Transcribe float PCM audio (16 kHz, mono, [-1..1] range).
     * Returns the transcribed text.
     */
    external fun transcribeAudio(
        contextPtr: Long,
        samples: FloatArray,
        language: String,
        beamSize: Int
    ): String

    /** Release the model context. */
    external fun freeModel(contextPtr: Long)
}
