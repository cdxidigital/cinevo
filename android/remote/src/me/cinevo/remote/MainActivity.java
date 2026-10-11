package me.cinevo.remote;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Sideload player. CINEVO Server stays on the computer; this activity plays the house. */
public class MainActivity extends Activity {
    private static final String PREFS = "cinevo-remote";
    private static final String ORIGIN = "origin";

    private LinearLayout root;
    private LinearLayout setup;
    private EditText address;
    private TextView status;
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#1A1A1E"));
        setContentView(root);

        setup = new LinearLayout(this);
        setup.setOrientation(LinearLayout.VERTICAL);
        setup.setPadding(dp(24), dp(48), dp(24), dp(24));

        TextView title = new TextView(this);
        title.setText("CINEVO");
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.WHITE);
        title.setTextSize(32);
        title.setLetterSpacing(0.06f);
        setup.addView(title);

        TextView tag = new TextView(this);
        tag.setText("Your media. Your moment.");
        tag.setTextColor(Color.parseColor("#FF4DA5"));
        tag.setTextSize(14);
        tag.setPadding(0, dp(8), 0, 0);
        setup.addView(tag);

        TextView help = new TextView(this);
        help.setText("Enter your CINEVO house. This is the player. CINEVO Server stays on the computer that holds the files.");
        help.setTextColor(Color.parseColor("#c8c8c8"));
        help.setTextSize(16);
        help.setLineSpacing(dp(2), 1f);
        help.setPadding(0, dp(16), 0, dp(18));
        setup.addView(help);

        address = new EditText(this);
        address.setHint("https://your-cinevo");
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setSingleLine(true);
        address.setTextColor(Color.WHITE);
        address.setHintTextColor(Color.parseColor("#8a8a8a"));
        address.setBackground(rounded("#141414", "#2a2a2a"));
        address.setMinHeight(dp(56));
        address.setPadding(dp(16), dp(12), dp(16), dp(12));
        setup.addView(address);

        status = new TextView(this);
        status.setTextColor(Color.parseColor("#ff8b9a"));
        status.setTextSize(13);
        status.setPadding(0, dp(12), 0, dp(12));
        setup.addView(status);

        Button connect = new Button(this);
        connect.setText("Connect");
        connect.setAllCaps(false);
        connect.setTypeface(Typeface.DEFAULT_BOLD);
        connect.setTextColor(Color.WHITE);
        connect.setBackground(rounded("#8B2FFF", null));
        connect.setMinHeight(dp(56));
        connect.setOnClickListener(v -> connect());
        setup.addView(connect);

        TextView fine = new TextView(this);
        fine.setText("CINEVO. A CDXI app, distributed as a Fourtee2 Digital project.");
        fine.setTextColor(Color.parseColor("#8a8a8a"));
        fine.setTextSize(12);
        fine.setPadding(0, dp(14), 0, 0);
        setup.addView(fine);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#1A1A1E"));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        String agent = settings.getUserAgentString();
        settings.setUserAgentString(agent + " CINEVOAndroid/2");
        web.setWebChromeClient(new WebChromeClient() {
            private View custom;
            private CustomViewCallback callback;

            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                if (custom != null) {
                    cb.onCustomViewHidden();
                    return;
                }
                custom = view;
                callback = cb;
                root.setVisibility(View.GONE);
                addContentView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
            }

            @Override
            public void onHideCustomView() {
                if (custom == null) return;
                ViewGroup parent = (ViewGroup) custom.getParent();
                if (parent != null) parent.removeView(custom);
                custom = null;
                root.setVisibility(View.VISIBLE);
                if (callback != null) callback.onCustomViewHidden();
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !sameHouse(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !sameHouse(request.getUrl().toString());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showSetup("Could not open that house. Check the address and try again.");
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, android.webkit.WebResourceResponse errorResponse) {
                if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                    showSetup("That house is not answering. Try the address again in a moment.");
                }
            }
        });

        String saved = prefs().getString(ORIGIN, "");
        if (saved == null || saved.isEmpty()) showSetup("");
        else showWeb(saved);
    }

    private boolean sameHouse(String url) {
        Uri next = Uri.parse(url);
        Uri saved = Uri.parse(prefs().getString(ORIGIN, ""));
        String host = next.getHost();
        return host != null && saved.getHost() != null && host.equalsIgnoreCase(saved.getHost());
    }

    private void connect() {
        String raw = address.getText().toString().trim();
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) raw = "https://" + raw;
        Uri uri = Uri.parse(raw);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null || host.isEmpty() || scheme == null || !(scheme.equals("http") || scheme.equals("https"))) {
            showSetup("Use a full address, like https://cinevo.example.");
            return;
        }
        if ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host)) {
            showSetup("A phone cannot open localhost. Use this computer’s address on your network.");
            return;
        }
        String origin = scheme + "://" + host;
        if (uri.getPort() != -1) origin += ":" + uri.getPort();
        prefs().edit().putString(ORIGIN, origin).apply();
        showWeb(origin);
    }

    private void showWeb(String origin) {
        root.removeAllViews();
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), dp(12), dp(12), dp(8));
        TextView label = new TextView(this);
        label.setText("CINEVO");
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setTextColor(Color.WHITE);
        label.setTextSize(16);
        label.setLetterSpacing(0.04f);
        LinearLayout.LayoutParams grow = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        label.setLayoutParams(grow);
        Button cast = new Button(this);
        cast.setText("Cast");
        cast.setAllCaps(false);
        cast.setTypeface(Typeface.DEFAULT_BOLD);
        cast.setTextColor(Color.parseColor("#8B2FFF"));
        cast.setBackgroundColor(Color.TRANSPARENT);
        cast.setOnClickListener(v -> web.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('cinevo-open-cast'))",
                null));
        Button change = new Button(this);
        change.setText("Change house");
        change.setAllCaps(false);
        change.setTextColor(Color.parseColor("#55CFFF"));
        change.setBackgroundColor(Color.TRANSPARENT);
        change.setOnClickListener(v -> showSetup(""));
        bar.addView(label);
        bar.addView(cast);
        bar.addView(change);
        root.addView(bar);
        web.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(web);
        web.loadUrl(origin + "/app");
    }

    private void showSetup(String message) {
        root.removeAllViews();
        root.addView(setup, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        String saved = prefs().getString(ORIGIN, "");
        if (saved != null && !saved.isEmpty() && address.getText().length() == 0) address.setText(saved);
        status.setText(message == null ? "" : message);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private GradientDrawable rounded(String fill, String stroke) {
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(16));
        shape.setColor(Color.parseColor(fill));
        if (stroke != null) shape.setStroke(Math.max(1, dp(1)), Color.parseColor(stroke));
        return shape;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.getParent() != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
