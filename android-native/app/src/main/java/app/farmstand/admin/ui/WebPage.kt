package app.farmstand.admin.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import app.farmstand.admin.Api

/** An admin page from the website, shown inside the app with the app's sign-in. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebPage(api: Api, title: String, path: String, onClose: () -> Unit) {
    var web by remember { mutableStateOf<WebView?>(null) }
    var progress by remember { mutableIntStateOf(0) }
    var pending by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        pending?.onReceiveValue(uris.toTypedArray())
        pending = null
    }
    val host = remember { Uri.parse(api.base).host }

    BackHandler {
        val w = web
        if (w != null && w.canGoBack()) w.goBack() else onClose()
    }

    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) { Icon(Icons.Filled.ArrowBack, "Back") }
            Text(title, Modifier.weight(1f), fontWeight = FontWeight.Bold)
            IconButton(onClick = { web?.reload() }) { Icon(Icons.Filled.Refresh, "Reload") }
        }
        if (progress in 1..99) LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
        HorizontalDivider()
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                api.shareCookiesWithWebView()
                WebView(ctx).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            val u = request.url
                            // The shop's own pages stay in the app; phone, email and other sites open their apps
                            if ((u.scheme == "https" || u.scheme == "http") && u.host == host) return false
                            runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                            return true
                        }
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onProgressChanged(view: WebView, newProgress: Int) {
                            progress = newProgress
                        }

                        override fun onShowFileChooser(
                            view: WebView,
                            callback: ValueCallback<Array<Uri>>,
                            params: FileChooserParams,
                        ): Boolean {
                            pending?.onReceiveValue(null)
                            pending = callback
                            pick.launch(params.acceptTypes.firstOrNull { it.isNotBlank() } ?: "*/*")
                            return true
                        }
                    }
                    loadUrl(api.webUrl(path))
                    web = this
                }
            },
            onRelease = { it.destroy() },
        )
    }
}
