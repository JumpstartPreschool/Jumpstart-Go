package in.jumpstartpreschool.go;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DutyPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        openFromIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openFromIntent(intent);
    }

    // Duty mode: the screen going off must not pause the page, or announcements stop.
    @Override public void onPause() {
        super.onPause();
        keepPageRunning();
    }

    @Override public void onStop() {
        super.onStop();
        keepPageRunning();
    }

    private void keepPageRunning() {
        if (!DutyService.running || getBridge() == null) return;
        WebView w = getBridge().getWebView();
        w.onResume();
        w.resumeTimers();
    }

    /** A notification tap carries a same-origin path; open that page of the school's site. */
    private void openFromIntent(Intent intent) {
        String path = intent == null ? null : Notif.safePath(intent.getStringExtra("url"));
        String base = getBridge().getServerUrl();
        if (path == null || base == null) return;
        getBridge().getWebView().loadUrl(base.replaceAll("/+$", "") + path);
    }
}
