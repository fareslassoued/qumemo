package com.qumemo.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.content.res.AssetManager
import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.MimeTypeMap
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
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // LocalStorage for bookmarks/settings
            databaseEnabled = true            // IndexedDB for recordings
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false  // Quran audio playback
        }

        // Register the ASR bridge (available even if model failed — isAvailable() returns false)
        val bridge = AsrBridge(webView, whisperCtx)
        webView.addJavascriptInterface(bridge, "__AndroidAsrBridge")

        // Intercept all requests and serve from assets/web/ subdirectory.
        // This makes URL path "/" map to "assets/web/", so /_next/... resolves correctly.
        val assets = this.assets
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val host = request.url.host ?: return null
                if (host != "appassets.androidplatform.net") return null

                val path = request.url.path?.trimStart('/') ?: "follow.html"
                val assetPath = "web/$path"

                return try {
                    val inputStream = assets.open(assetPath, AssetManager.ACCESS_STREAMING)
                    val mimeType = guessMimeType(path)
                    WebResourceResponse(mimeType, "UTF-8", inputStream)
                } catch (e: Exception) {
                    Log.w(TAG, "Asset not found: $assetPath")
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

        // Load via the fake HTTPS domain — interceptor maps to assets/web/
        webView.loadUrl("https://appassets.androidplatform.net/follow.html")
        Log.i(TAG, "WebView loading follow.html (whisper ctx=$whisperCtx)")
    }

    private fun guessMimeType(path: String): String {
        val ext = MimeTypeMap.getFileExtensionFromUrl(path) ?: ""
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
            ?: when {
                path.endsWith(".js") -> "application/javascript"
                path.endsWith(".css") -> "text/css"
                path.endsWith(".html") -> "text/html"
                path.endsWith(".json") -> "application/json"
                path.endsWith(".woff2") -> "font/woff2"
                path.endsWith(".woff") -> "font/woff"
                path.endsWith(".svg") -> "image/svg+xml"
                else -> "application/octet-stream"
            }
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
