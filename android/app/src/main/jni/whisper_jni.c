/**
 * JNI bridge: Kotlin <-> whisper.cpp
 *
 * Exposes three functions to Kotlin:
 *   - initModel(modelPath) -> context pointer
 *   - transcribeAudio(ctx, floatSamples, language, beamSize) -> text
 *   - freeModel(ctx)
 */

#include <jni.h>
#include <string.h>
#include <android/log.h>
#include "whisper.h"

#define TAG "WhisperJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

/* ── initModel ─────────────────────────────────────────── */

JNIEXPORT jlong JNICALL
Java_com_qumemo_app_WhisperLib_initModel(
    JNIEnv *env, jobject thiz, jstring model_path)
{
    const char *path = (*env)->GetStringUTFChars(env, model_path, NULL);
    LOGI("Loading model: %s", path);

    struct whisper_context_params cparams = whisper_context_default_params();
    struct whisper_context *ctx = whisper_init_from_file_with_params(path, cparams);

    (*env)->ReleaseStringUTFChars(env, model_path, path);

    if (ctx == NULL) {
        LOGE("Failed to load model");
        return 0;
    }

    LOGI("Model loaded successfully");
    return (jlong)(intptr_t)ctx;
}

/* ── transcribeAudio ───────────────────────────────────── */

JNIEXPORT jstring JNICALL
Java_com_qumemo_app_WhisperLib_transcribeAudio(
    JNIEnv *env, jobject thiz,
    jlong ctx_ptr, jfloatArray samples,
    jstring language, jint beam_size)
{
    struct whisper_context *ctx = (struct whisper_context *)(intptr_t)ctx_ptr;
    if (ctx == NULL) {
        return (*env)->NewStringUTF(env, "");
    }

    /* Get audio samples */
    jsize n_samples = (*env)->GetArrayLength(env, samples);
    jfloat *pcm = (*env)->GetFloatArrayElements(env, samples, NULL);

    LOGI("Transcribing %d samples (%.1fs)", n_samples, (float)n_samples / 16000.0f);

    /* Configure transcription parameters */
    struct whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_BEAM_SEARCH);

    const char *lang = (*env)->GetStringUTFChars(env, language, NULL);
    params.language  = lang;
    params.translate = false;  /* transcribe, don't translate */

    params.beam_search.beam_size = beam_size;
    params.n_threads  = 4;     /* Pixel 7 has 8 cores, use 4 for inference */
    params.no_timestamps = true;
    params.single_segment = true;  /* treat as one continuous segment */

    /* Suppress non-speech tokens to reduce hallucination */
    params.suppress_blank = true;
    params.suppress_nst   = true;

    /* Run inference */
    int ret = whisper_full(ctx, params, pcm, n_samples);

    (*env)->ReleaseStringUTFChars(env, language, lang);
    (*env)->ReleaseFloatArrayElements(env, samples, pcm, JNI_ABORT);

    if (ret != 0) {
        LOGE("whisper_full failed with code %d", ret);
        return (*env)->NewStringUTF(env, "");
    }

    /* Collect all segments into one string */
    int n_segments = whisper_full_n_segments(ctx);
    char result[4096] = "";
    int offset = 0;

    for (int i = 0; i < n_segments; i++) {
        const char *text = whisper_full_get_segment_text(ctx, i);
        int len = strlen(text);
        if (offset + len + 1 < (int)sizeof(result)) {
            if (offset > 0) {
                result[offset++] = ' ';
            }
            memcpy(result + offset, text, len);
            offset += len;
        }
    }
    result[offset] = '\0';

    LOGI("Result: %s", result);
    return (*env)->NewStringUTF(env, result);
}

/* ── freeModel ─────────────────────────────────────────── */

JNIEXPORT void JNICALL
Java_com_qumemo_app_WhisperLib_freeModel(
    JNIEnv *env, jobject thiz, jlong ctx_ptr)
{
    struct whisper_context *ctx = (struct whisper_context *)(intptr_t)ctx_ptr;
    if (ctx != NULL) {
        whisper_free(ctx);
        LOGI("Model freed");
    }
}
