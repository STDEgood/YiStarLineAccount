package com.yistarline.yaua;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * YiStarLine Account Unified App · Android 外壳
 *
 * 界面复用桌面版的 HTML/CSS/JS（assets/www），后端由 android-api.js 在 WebView 内实现，
 * 数据保存在应用私有的 localStorage 中，完全离线。
 */
public class MainActivity extends Activity {

    private static final int REQ_EXPORT = 1001;
    private static final int REQ_IMPORT = 1002;

    private WebView web;
    private String pendingExport = null;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        Window window = getWindow();
        window.setStatusBarColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            window.setNavigationBarColor(Color.WHITE);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " YAUA-Android/1.2.0");

        web.addJavascriptInterface(new Bridge(), "YAUABridge");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || !"localhost".equals(uri.getHost())) {
                    return null;
                }
                String path = uri.getPath();
                if (path == null || "/".equals(path)) {
                    path = "/index.html";
                }
                try {
                    InputStream stream = getAssets().open("www" + path);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cache-Control", "no-store");
                    return new WebResourceResponse(mimeOf(path), "utf-8", 200, "OK", headers, stream);
                } catch (IOException error) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                            new HashMap<String, String>(),
                            new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8)));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && "localhost".equals(uri.getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // 没有可处理该链接的应用
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                        "(function(){try{return JSON.stringify({title:document.title,href:location.href,"
                                + "body:(document.body?document.body.innerText.length:-1),"
                                + "app:(document.getElementById('app')?document.getElementById('app').innerHTML.length:-1)});}"
                                + "catch(e){return 'ERR '+e.message;}})()",
                        new android.webkit.ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                android.util.Log.i("YAUA", "page-state " + value);
                            }
                        });
            }
        });

        setContentView(web);
        web.loadUrl("http://localhost/index.html");
    }

    private int dimen(String name) {
        int resId = getResources().getIdentifier(name, "dimen", "android");
        return resId > 0 ? getResources().getDimensionPixelSize(resId) : 0;
    }

    private static String mimeOf(String path) {        String lower = path.toLowerCase();
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".md") || lower.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            return;
        }
        Uri uri = data.getData();
        if (requestCode == REQ_EXPORT) {
            writeBackup(uri);
        } else if (requestCode == REQ_IMPORT) {
            readBackup(uri);
        }
    }

    private void writeBackup(Uri uri) {
        if (pendingExport == null) {
            return;
        }
        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
            if (out == null) {
                throw new IOException("无法写入所选位置");
            }
            out.write(pendingExport.getBytes(StandardCharsets.UTF_8));
            toast("备份已保存");
        } catch (IOException error) {
            toast("备份失败：" + error.getMessage());
        } finally {
            pendingExport = null;
        }
    }

    private void readBackup(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) {
                throw new IOException("无法读取所选文件");
            }
            byte[] buffer = new byte[in.available()];
            int read = in.read(buffer);
            String text = new String(buffer, 0, Math.max(read, 0), StandardCharsets.UTF_8);
            String script = "window.YAUA_RESTORE(" + JSONObject.quote(text) + ")";
            web.evaluateJavascript(script, new android.webkit.ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if ("true".equals(value)) {
                        toast("备份已恢复");
                        web.evaluateJavascript("window.YAUA_AFTER_RESTORE()", null);
                    } else {
                        toast("恢复失败：文件格式不正确");
                    }
                }
            });
        } catch (IOException error) {
            toast("读取失败：" + error.getMessage());
        }
    }

    private void toast(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /** 暴露给网页的本地能力 */
    public class Bridge {
        @JavascriptInterface
        public int statusBarHeight() {
            return dimen("status_bar_height");
        }

        @JavascriptInterface
        public int navBarHeight() {
            return dimen("navigation_bar_height");
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public String version() {
            return "1.2.0";
        }

        @JavascriptInterface
        public void toast(String message) {
            MainActivity.this.toast(message);
        }

        @JavascriptInterface
        public String exportBackup(String filename, String content) {
            pendingExport = content;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, filename);
                    try {
                        startActivityForResult(intent, REQ_EXPORT);
                    } catch (Exception error) {
                        toast("无法打开文件选择器");
                    }
                }
            });
            return "请选择保存位置";
        }

        @JavascriptInterface
        public void importBackup() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    try {
                        startActivityForResult(intent, REQ_IMPORT);
                    } catch (Exception error) {
                        toast("无法打开文件选择器");
                    }
                }
            });
        }

        @JavascriptInterface
        public void finishApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
