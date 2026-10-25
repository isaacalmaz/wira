package com.wira.user;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        normalizeWidgetIntent(getIntent());

        // Android 15+ draws apps edge-to-edge (no opt-out when targeting 36),
        // so pad the WebView clear of the status bar, navigation bar and keyboard.
        View content = findViewById(android.R.id.content);
        // The padding strips sit behind the (transparent) system bars: paint
        // them in the app colour so the light status-bar icons stay visible.
        content.setBackgroundColor(Color.parseColor("#0B4F5E"));
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout()
                            | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        normalizeWidgetIntent(intent);
        setIntent(intent);
    }

    private void normalizeWidgetIntent(Intent intent) {
        if (intent == null) return;
        boolean openAi = intent.getBooleanExtra("open_ai", false);
        boolean autoListen = intent.getBooleanExtra("auto_listen", false);
        if ((openAi || autoListen) && intent.getData() == null) {
            String uriStr = "wira://ai?open_ai=" + openAi + "&auto_listen=" + autoListen;
            intent.setData(Uri.parse(uriStr));
            intent.setAction(Intent.ACTION_VIEW);
        }
    }
}
