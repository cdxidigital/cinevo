package me.cinevo.handset;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Phone remote. It sends playback controls. It never receives file paths. */
public class MainActivity extends Activity {
    private static final String PREFS = "cinevo-handset";
    private final Handler main = new Handler(Looper.getMainLooper());

    private LinearLayout root;
    private EditText house;
    private EditText code;
    private TextView now;
    private TextView status;
    private String origin = "";
    private String activeCode = "";
    private boolean running;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#09090B"));
        root.setPadding(dp(20), dp(28), dp(20), dp(20));
        setContentView(root);
        showSetup("");
    }

    @Override
    protected void onPause() {
        running = false;
        super.onPause();
    }

    private void showSetup(String message) {
        running = false;
        root.removeAllViews();
        TextView title = label("CINEVO", 32, "#FFFFFF");
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);
        TextView tag = label("Remote", 14, "#FF4DA5");
        tag.setPadding(0, dp(6), 0, dp(12));
        root.addView(tag);
        root.addView(label("Enter the house address and the six-character code on the screen you want to control.", 16, "#D4D4D8"));
        house = field("https://your-cinevo");
        code = field("Code");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        String savedHouse = prefs().getString("house", "");
        String savedCode = prefs().getString("code", "");
        if (savedHouse != null) house.setText(savedHouse);
        if (savedCode != null) code.setText(savedCode);
        root.addView(house);
        root.addView(code);
        status = label(message == null ? "" : message, 13, "#FDA4AF");
        root.addView(status);
        Button connect = button("Connect");
        connect.setOnClickListener(v -> connect());
        root.addView(connect);
        TextView fine = label("Published by fourtee2digital. Developed by cdxidigital.", 12, "#A1A1AA");
        fine.setPadding(0, dp(16), 0, 0);
        root.addView(fine);
    }

    private void showRemote() {
        root.removeAllViews();
        now = label("Waiting for the house…", 18, "#FFFFFF");
        now.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(now);
        status = label(origin, 13, "#A1A1AA");
        root.addView(status);
        root.addView(pair("Play", "toggle", "Back 10s", "seek", -10));
        root.addView(pair("Pause", "pause", "Forward 10s", "seek", 10));
        root.addView(pair("Stop", "stop", "Volume", "volume", 0));
        Button change = button("Change house");
        change.setOnClickListener(v -> showSetup(""));
        root.addView(change);
        running = true;
        poll();
    }

    private LinearLayout pair(String a, String aType, String b, String bType, int amount) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button left = button(a);
        Button right = button(b);
        left.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        right.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        left.setOnClickListener(v -> send(aType, amount));
        right.setOnClickListener(v -> send(bType, amount));
        row.addView(left);
        row.addView(right);
        return row;
    }

    private void connect() {
        String raw = house.getText().toString().trim();
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) raw = "https://" + raw;
        Uri uri = Uri.parse(raw);
        String host = uri.getHost();
        String scheme = uri.getScheme();
        String clean = code.getText().toString().toUpperCase().replaceAll("[^A-Z0-9]", "");
        if (host == null || scheme == null || !(scheme.equals("http") || scheme.equals("https"))) {
            status.setText("Use a full address, like https://cinevo.example.");
            return;
        }
        if (clean.length() != 6) {
            status.setText("The code is six letters or numbers, shown on the house.");
            return;
        }
        origin = scheme + "://" + host + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
        activeCode = clean;
        prefs().edit().putString("house", origin).putString("code", clean).apply();
        showRemote();
    }

    private void poll() {
        if (!running) return;
        final String target = origin + "/api/remote?code=" + activeCode;
        new Thread(() -> {
            String line = "The house has not reported a title yet.";
            String error = "";
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(target).openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                if (conn.getResponseCode() == 200) {
                    JSONObject json = new JSONObject(read(conn));
                    JSONObject row = json.optJSONObject("now");
                    if (row != null && row.optString("title").length() > 0) {
                        line = row.optString("title") + (row.optBoolean("playing") ? " · playing" : " · paused");
                    }
                } else {
                    error = "That code is not active on the house.";
                }
                conn.disconnect();
            } catch (Exception errorThrown) {
                error = "Could not reach the house.";
            }
            final String next = error.isEmpty() ? line : error;
            main.post(() -> {
                if (running && now != null) now.setText(next);
            });
        }).start();
        main.postDelayed(this::poll, 2000);
    }

    private void send(String type, int amount) {
        final String target = origin + "/api/remote";
        new Thread(() -> {
            String message = "Sent.";
            try {
                JSONObject command = new JSONObject();
                command.put("type", type);
                command.put("id", "h-" + System.currentTimeMillis());
                if ("seek".equals(type)) command.put("by", amount);
                if ("volume".equals(type)) command.put("value", 1);
                JSONObject body = new JSONObject();
                body.put("action", "command");
                body.put("code", activeCode);
                body.put("command", command);
                HttpURLConnection conn = (HttpURLConnection) new URL(target).openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setDoOutput(true);
                conn.setRequestProperty("content-type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                OutputStream out = conn.getOutputStream();
                out.write(bytes);
                out.close();
                if (conn.getResponseCode() >= 400) message = "The house refused that.";
                conn.disconnect();
            } catch (Exception error) {
                message = "Could not reach the house.";
            }
            final String next = message;
            main.post(() -> {
                if (status != null) status.setText(next);
            });
        }).start();
    }

    private String read(HttpURLConnection conn) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) out.append(line);
        reader.close();
        return out.toString();
    }

    private TextView label(String text, int size, String color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(Color.parseColor(color));
        return view;
    }

    private EditText field(String hint) {
        EditText view = new EditText(this);
        view.setHint(hint);
        view.setSingleLine(true);
        view.setTextColor(Color.WHITE);
        view.setHintTextColor(Color.parseColor("#71717A"));
        view.setBackground(rounded("#18181B"));
        view.setMinHeight(dp(52));
        view.setPadding(dp(14), dp(10), dp(14), dp(10));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(10);
        view.setLayoutParams(params);
        return view;
    }

    private Button button(String text) {
        Button view = new Button(this);
        view.setText(text);
        view.setAllCaps(false);
        view.setTextColor(Color.WHITE);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setBackground(rounded("#8B2FFF"));
        view.setMinHeight(dp(52));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(8);
        params.leftMargin = dp(4);
        params.rightMargin = dp(4);
        view.setLayoutParams(params);
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private GradientDrawable rounded(String fill) {
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(16));
        shape.setColor(Color.parseColor(fill));
        return shape;
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
