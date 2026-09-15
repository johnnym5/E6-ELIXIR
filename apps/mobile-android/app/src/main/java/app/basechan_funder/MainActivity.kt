package app.basechan_funder

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.JavascriptInterface
import android.net.Uri
import android.database.Cursor
import android.provider.Telephony
import android.util.Log
import android.content.pm.PackageManager
import android.Manifest
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import java.util.regex.Pattern

class MainActivity : ComponentActivity() {
    companion object {
        var instance: MainActivity? = null
        private const val GOOGLE_SIGN_IN_RC = 9001
    }

    private lateinit var webView: WebView
    private lateinit var googleSignInClient: GoogleSignInClient

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        enableEdgeToEdge()
        
        // Configure Google Sign In
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken("1053228569213-gmqs7gromujm3esbd190klhd9rbm1grb.apps.googleusercontent.com")
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(this, gso)

        // Enable remote debugging for development
        WebView.setWebContentsDebuggingEnabled(true)

        webView = WebView(this)
        
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString()
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    // Allow navigation within the app assets or to Firebase Auth
                    if (url.startsWith("https://appassets.androidplatform.net") || 
                        url.contains("firebaseapp.com") || 
                        url.contains("google.com/accounts")) {
                        return false 
                    }
                    // For other URLs, open in external browser
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        view?.context?.startActivity(intent)
                        return true
                    } catch (e: Exception) {
                        return false
                    }
                }
                return super.shouldOverrideUrlLoading(view, request)
            }
        }

        webView.webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?
            ): Boolean {
                val newWebView = WebView(this@MainActivity)
                val newSettings = newWebView.settings
                newSettings.javaScriptEnabled = true
                newSettings.supportMultipleWindows()
                newSettings.javaScriptCanOpenWindowsAutomatically = true
                newSettings.domStorageEnabled = true
                newSettings.databaseEnabled = true
                newSettings.setSupportMultipleWindows(true)
                
                // Set a custom User Agent to avoid "disallowed_useragent" errors
                val chromeUserAgent = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                newSettings.userAgentString = chromeUserAgent

                // Allow cookies for the popup
                val cookieManager = android.webkit.CookieManager.getInstance()
                cookieManager.setAcceptThirdPartyCookies(newWebView, true)

                // Show the popup webview in a full-screen dialog
                val dialog = android.app.Dialog(this@MainActivity, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
                dialog.setContentView(newWebView)
                
                // Allow the dialog to be dismissed by back button
                dialog.setCancelable(true)
                dialog.show()

                val transport = resultMsg?.obj as WebView.WebViewTransport
                transport.webView = newWebView
                resultMsg.sendToTarget()

                newWebView.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val url = request?.url?.toString() ?: ""
                        // If it's the Firebase Auth handler, keep it in the popup
                        if (url.contains("firebaseapp.com/__/auth/handler")) {
                            return false
                        }
                        return false
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        // If the popup reaches the final "close" state or handler finishes
                        if (url != null && url.contains("close_after_login")) {
                            dialog.dismiss()
                        }
                    }
                }
                
                // Handle window.close()
                newWebView.webChromeClient = object : android.webkit.WebChromeClient() {
                    override fun onCloseWindow(window: WebView?) {
                        dialog.dismiss()
                    }
                }

                return true
            }
        }
        
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.setSupportMultipleWindows(true) // Required for some auth flows
        
        // Allow cookies and third-party cookies for Firebase Auth
        val cookieManager = android.webkit.CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true

        // Register the JS Bridge
        webView.addJavascriptInterface(AndroidInterface(), "AndroidBridge")

        setContentView(webView)
        
        // Handle deep link from intent extras if present
        val deepLink = intent.getStringExtra("deepLinkRoute")
        val finalUrl = if (deepLink != null) {
            "https://appassets.androidplatform.net/index.html#$deepLink"
        } else {
            "https://appassets.androidplatform.net/index.html"
        }
        
        webView.loadUrl(finalUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("deepLinkRoute")?.let { route ->
            webView.post {
                webView.evaluateJavascript("window.location.hash = '$route'", null)
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == GOOGLE_SIGN_IN_RC) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            try {
                val account = task.getResult(ApiException::class.java)
                val idToken = account?.idToken
                if (idToken != null) {
                    Log.d("MainActivity", "Native Google Login Success. Passing ID Token to Web.")
                    webView.post {
                        webView.evaluateJavascript("window.onNativeGoogleLoginSuccess?.('$idToken')", null)
                    }
                } else {
                    Log.e("MainActivity", "Google ID Token is null")
                    webView.post {
                        webView.evaluateJavascript("window.onNativeGoogleLoginError?.('ID_TOKEN_NULL')", null)
                    }
                }
            } catch (e: ApiException) {
                Log.e("MainActivity", "Google sign in failed", e)
                webView.post {
                    webView.evaluateJavascript("window.onNativeGoogleLoginError?.('${e.statusCode}')", null)
                }
            }
        }
    }

    inner class AndroidInterface {
        @JavascriptInterface
        fun triggerNativeGoogleLogin() {
            Log.d("MainActivity", "triggerNativeGoogleLogin called")
            val signInIntent = googleSignInClient.signInIntent
            startActivityForResult(signInIntent, GOOGLE_SIGN_IN_RC)
        }

        @JavascriptInterface
        fun getVersionCode(): Int {
            return try {
                val pInfo = packageManager.getPackageInfo(packageName, 0)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                    pInfo.longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION")
                    pInfo.versionCode
                }
            } catch (e: Exception) {
                0
            }
        }

        @JavascriptInterface
        fun installApkFromUrl(url: String) {
            Log.d("MainActivity", "installApkFromUrl: $url")
            // In a production environment, this would trigger a DownloadManager request
            // and an Intent to install the package via FileProvider.
            // For now, we log it clearly.
        }

        @JavascriptInterface
        fun triggerSmsSync(mask: String, bankName: String) {
            Log.d("MainActivity", "triggerSmsSync called for mask: $mask, bank: $bankName")
            
            try {
                // Check for SMS permissions at runtime
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this@MainActivity, arrayOf(Manifest.permission.READ_SMS), 101)
                    webView.post {
                        webView.evaluateJavascript("window.onSmsSyncFailed?.('$mask', 'PERMISSION_DENIED')", null)
                    }
                    return
                }

                val result = scanInboxForBankBalance(mask, bankName)
                if (result != null) {
                    updateSmsBalance(result.balance, result.mask, result.timestamp)
                } else {
                    webView.post {
                        webView.evaluateJavascript("window.onSmsSyncFailed?.('$mask', 'NOT_FOUND')", null)
                    }
                }
            } catch (e: Exception) {
                Log.e("MainActivity", "Error during SMS sync", e)
                webView.post {
                    webView.evaluateJavascript("window.onSmsSyncFailed?.('$mask', 'ERROR')", null)
                }
            }
        }
    }

    data class SmsScanResult(
        val balance: Double,
        val mask: String,
        val timestamp: Long,
        val bankName: String
    )

    private fun scanInboxForBankBalance(targetMask: String, targetBank: String): SmsScanResult? {
        val uri = Uri.parse("content://sms/inbox")
        val cursor: Cursor? = contentResolver.query(uri, null, null, null, "date DESC")
        
        cursor?.use {
            val addressIdx = it.getColumnIndex("address")
            val bodyIdx = it.getColumnIndex("body")
            val dateIdx = it.getColumnIndex("date")
            
            while (it.moveToNext()) {
                val address = it.getString(addressIdx) ?: ""
                val body = it.getString(bodyIdx) ?: ""
                val date = it.getLong(dateIdx)
                
                val identifiedBank = identifyBank(address) ?: continue
                
                // 1. Filter by Bank Name (The ultimate source of truth for the user)
                if (identifiedBank != targetBank) continue

                // Strict Disambiguation: Filter by Bal/Balance only to avoid picking up Txn Amt
                // Synchronized with BankSmsReceiver regex
                val balancePattern = Pattern.compile("(?:Bal|Balance|Avail\\s+Bal|Ledger\\s+Bal|New\\s+Bal)(?:\\s*:|\\s+is|\\s*-)?\\s*(?:NGN|₦|#)?\\s*([0-9,]+\\.[0-9]{2})", Pattern.CASE_INSENSITIVE)
                val acctPattern = Pattern.compile("(?:Acct|Ac|Acc|A/c|Account)\\s*[:\\s]*[\\w\\.\\*]*(\\d{4})", Pattern.CASE_INSENSITIVE)
                
                val balMatcher = balancePattern.matcher(body)
                val acctMatcher = acctPattern.matcher(body)
                
                if (balMatcher.find()) {
                    val balanceStr = balMatcher.group(1) ?: ""
                    val balance = balanceStr.replace(",", "").toDoubleOrNull()
                    
                    val foundMask = if (acctMatcher.find()) acctMatcher.group(1) ?: "XXXX" else "XXXX"

                    Log.d("MainActivity", "Identified $identifiedBank alert. Found Bal: $balanceStr, Mask in SMS: $foundMask")

                    // 3. Robust Validation:
                    // If targetMask is provided (e.g. 9543) and foundMask is also provided (e.g. 1234) and they DON'T match:
                    // We skip this message because it belongs to a DIFFERENT account at the same bank.
                    if (foundMask != "XXXX" && targetMask.isNotEmpty() && targetMask != "XXXX" && foundMask != targetMask) {
                        continue
                    }
                    
                    // IF SMS has NO mask ("XXXX"), we accept it as the latest balance for this specific bank (User's request).
                    // OR if masks match perfectly.

                    if (balance != null) {
                        Log.i("MainActivity", "SUCCESS: Found latest balance for $identifiedBank: $balance")
                        return SmsScanResult(balance, if (foundMask == "XXXX") targetMask else foundMask, date, identifiedBank)
                    }
                }
            }
        }
        return null
    }

    private fun identifyBank(sender: String): String? {
        return when {
            sender.contains("UBA", true) || sender.contains("UBALERT", true) || 
            sender.contains("UBA-ALERT", true) || sender.contains("UBADIRECT", true) ||
            sender.contains("UBAGroup", true) -> "United Bank for Africa (UBA)"
            sender.contains("GTBank", true) || sender.contains("GTB", true) -> "Guaranty Trust Bank (GTB)"
            sender.contains("Access", true) -> "Access Bank"
            sender.contains("Zenith", true) -> "Zenith Bank"
            sender.contains("FirstBank", true) || sender.contains("FBN", true) -> "First Bank of Nigeria"
            sender.contains("Parallex", true) -> "Parallex Bank"
            sender.contains("Kuda", true) -> "Kuda MFB"
            else -> null
        }
    }

    fun updateSmsBalance(balance: Double, mask: String, timestamp: Long) {
        webView.post {
            webView.evaluateJavascript("window.onSmsBalanceUpdate?.($balance, '$mask', $timestamp)", null)
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
