package com.qumemo.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.content.res.AssetManager
import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * WebView host for Qumemo follow-along mode.
 *
 * Loads the static-exported Next.js app and injects the native
 * whisper.cpp ASR bridge via @JavascriptInterface.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "QumemoASR"
        private const val REQUEST_MIC = 1001
        private const val MODEL_FILENAME = "ggml-tarteel-base-q5_1.bin"

        /** File extension → MIME type for static web assets */
        private val MIME_TYPES = mapOf(
            "js" to "application/javascript",
            "mjs" to "application/javascript",
            "css" to "text/css",
            "html" to "text/html",
            "htm" to "text/html",
            "json" to "application/json",
            "woff2" to "font/woff2",
            "woff" to "font/woff",
            "ttf" to "font/ttf",
            "otf" to "font/otf",
            "svg" to "image/svg+xml",
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "jpeg" to "image/jpeg",
            "webp" to "image/webp",
            "gif" to "image/gif",
            "ico" to "image/x-icon",
            "mp3" to "audio/mpeg",
            "wasm" to "application/wasm",
            "txt" to "text/plain",
            "xml" to "application/xml",
            "webmanifest" to "application/manifest+json",
        )

        private fun mimeForPath(path: String): String {
            val ext = path.substringAfterLast('.', "").lowercase()
            return MIME_TYPES[ext] ?: "application/octet-stream"
        }
    }

    private lateinit var webView: WebView
    private var whisperCtx: Long = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        // Request mic permission first, then load model + app
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MIC)
        } else {
            initApp()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_MIC && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            initApp()
        } else {
            Log.e(TAG, "Mic permission denied")
            loadWebApp() // Load without ASR bridge
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (whisperCtx != 0L) {
            WhisperLib.freeModel(whisperCtx)
            whisperCtx = 0
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun initApp() {
        lifecycleScope.launch {
            // Load whisper model in background
            val modelPath = withContext(Dispatchers.IO) {
                copyAssetToInternal(MODEL_FILENAME)
            }

            if (modelPath != null) {
                val ctx = withContext(Dispatchers.IO) {
                    try {
                        WhisperLib.initModel(modelPath)
                    } catch (e: Exception) {
                        Log.e(TAG, "initModel failed", e)
                        0L
                    }
                }
                whisperCtx = ctx
                val size = File(modelPath).length() / 1_000_000
                Log.i(TAG, "Model loaded: ${size}MB, ctx=$ctx")
            } else {
                Log.e(TAG, "Model not found: $MODEL_FILENAME")
            }

            loadWebApp()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun loadWebApp() {
        // Debug: verify assets are in the APK
        try {
            val rootFiles = assets.list("") ?: emptyArray()
            Log.i(TAG, "Assets root: ${rootFiles.joinToString()}")
            val hasNext = rootFiles.contains("_next")
            val hasFollow = rootFiles.contains("follow.html")
            Log.i(TAG, "  _next=${hasNext}, follow.html=${hasFollow}")
            if (hasNext) {
                val chunks = assets.list("_next/static/chunks") ?: emptyArray()
                Log.i(TAG, "  _next/static/chunks: ${chunks.size} files")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to list assets: ${e.message}")
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // LocalStorage for bookmarks/settings
            databaseEnabled = true            // IndexedDB for recordings
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false  // Quran audio playback
            useWideViewPort = true            // Respect <meta name="viewport">
            loadWithOverviewMode = true       // Fit content to WebView width
        }

        // Register the ASR bridge (available even if model failed — isAvailable() returns false)
        val bridge = AsrBridge(webView, whisperCtx)
        webView.addJavascriptInterface(bridge, "__AndroidAsrBridge")

        // Serve assets directly — bypasses WebViewAssetLoader entirely.
        // Opens asset files manually with correct MIME types and status codes.
        val appAssets = this.assets
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val url = request.url
                if (url.host != "appassets.androidplatform.net") return null

                var path = url.path?.trimStart('/') ?: ""
                if (path.isEmpty() || path.endsWith("/")) {
                    path = "${path}index.html"
                }

                val mimeType = mimeForPath(path)

                return try {
                    val inputStream = appAssets.open(path, AssetManager.ACCESS_STREAMING)
                    val encoding = if (mimeType.startsWith("text/") ||
                        mimeType.contains("javascript") ||
                        mimeType.contains("json") ||
                        mimeType.contains("xml") ||
                        mimeType.contains("svg")) "UTF-8" else null

                    Log.d(TAG, "SERVE $mimeType: $path (${if (encoding != null) "text" else "binary"})")

                    val response = WebResourceResponse(mimeType, encoding, inputStream)
                    response.setStatusCodeAndReasonPhrase(200, "OK")
                    response.responseHeaders = mapOf(
                        "Access-Control-Allow-Origin" to "*",
                        "Access-Control-Allow-Methods" to "GET",
                        "Cache-Control" to "no-cache",
                    )
                    response
                } catch (e: java.io.FileNotFoundException) {
                    Log.w(TAG, "NOT FOUND: $path")
                    val response = WebResourceResponse("text/plain", "UTF-8", null)
                    response.setStatusCodeAndReasonPhrase(404, "Not Found")
                    response
                } catch (e: Exception) {
                    Log.e(TAG, "ERROR serving $path: ${e.message}")
                    null
                }
            }
        }

        // Forward web console logs to logcat for debugging
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                Log.d("WebView", "${msg.sourceId()}:${msg.lineNumber()} ${msg.message()}")
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        }

        // Load follow-along page via fake HTTPS origin — interceptor serves from assets/
        webView.loadUrl("https://appassets.androidplatform.net/follow.html")
        Log.i(TAG, "WebView loading follow.html (whisper ctx=$whisperCtx)")
    }

    private fun copyAssetToInternal(filename: String): String? {
        val outFile = File(filesDir, filename)

        if (outFile.exists() && outFile.length() > 1_000_000) {
            Log.i(TAG, "Model cached: ${outFile.absolutePath} (${outFile.length() / 1_000_000}MB)")
            return outFile.absolutePath
        }
        outFile.delete() // Remove corrupted cache

        return try {
            assets.open("models/$filename").use { input ->
                FileOutputStream(outFile).use { output ->
                    val bytes = input.copyTo(output)
                    Log.i(TAG, "Model copied: $bytes bytes")
                }
            }
            outFile.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "Model copy failed: ${e.message}")
            null
        }
    }
}
