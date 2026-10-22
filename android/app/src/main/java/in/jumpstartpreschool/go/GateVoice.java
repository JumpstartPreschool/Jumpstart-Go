package in.jumpstartpreschool.go;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.text.TextUtils;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * The phone's own gate announcer, for alerts that arrive while the duty screen can't speak (screen off, app in the
 * background or closed). It plays what the duty screen would (src/features/duty/sound.ts): the same chime, then the
 * school's recordings, made ahead by the pronounce function and fetched with the link push-send signed for this alert.
 * One announcement at a time, most urgent first, then in arrival order; each alert once; nothing after its expiry. A
 * recording that can't be had in time is read by the phone's own voice instead, and an alert that can't be said at all
 * (a call keeps the audio, no voice) is shown again with its sound, so it is never silent.
 */
final class GateVoice {
    static final String TAG = DutyService.TAG;
    // The duty screen's chime (sound.ts NOTES, NOTE_GAP, NOTE_LENGTH) and the pause between recordings (PART_GAP_MS).
    static final double[] NORMAL = { 659.3, 987.8 };
    static final double[] FLAGGED = { 784, 988, 1175 };
    static final double NOTE_GAP = 0.2, NOTE_LENGTH = 0.55;
    static final int RATE = 24_000;
    static final long PART_GAP_MS = 150;
    // The screen gets its clips ready ahead; a phone woken by a push fetches them during the chime, so it waits longer.
    static final long CLIP_WAIT_MS = 5_000;
    // Nothing sounded (a phone call had the audio, say): tried again this soon, once, while it is still worth saying.
    static final long RETRY_MS = 15_000;
    static final int MAX_TRIES = 2;
    static final int KEEP_CLIPS = 300;
    static final int REMEMBER_ALERTS = 100;
    private static final Pattern KEY = Pattern.compile("[0-9a-f]{64}");

    /** One alert to say, from the push's data (push.ts fcmMessageFor). */
    static final class Item {
        String tag = "", speak = "", receipt, ack;
        long outboxId, order, expires;
        int priority = 20;
        boolean flagged;
        String[] keys = new String[0], urls = new String[0];
        // The push as it came, to show it again with its sound if it can't be said.
        Bundle data;
        // Kept by the queue.
        long seq, notBefore;
        int tries;
        Future<File[]> clips;

        static Item from(Bundle b) {
            long now = System.currentTimeMillis();
            Item it = new Item();
            it.data = b;
            it.tag = str(b, "tag");
            it.speak = str(b, "speak");
            it.receipt = b.getString("receipt");
            it.ack = b.getString("ack");
            it.outboxId = num(b, "outbox_id", 0);
            it.order = num(b, "order", now);
            it.expires = num(b, "expires", now + 10 * 60_000);
            it.priority = (int) num(b, "priority", 20);
            it.flagged = "flagged".equals(b.getString("chime"));
            try {
                JSONArray a = new JSONArray(str(b, "clips").isEmpty() ? "[]" : str(b, "clips"));
                List<String> keys = new ArrayList<>(), urls = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject c = a.getJSONObject(i);
                    String key = c.optString("key"), url = c.optString("url");
                    // All or none: a recording with a bad key or link means the phone's voice says it all.
                    if (!validKey(key) || !validUrl(url)) { keys.clear(); urls.clear(); break; }
                    keys.add(key);
                    urls.add(url);
                }
                it.keys = keys.toArray(new String[0]);
                it.urls = urls.toArray(new String[0]);
            } catch (Exception e) {
                Log.w(TAG, "clips unreadable", e);
            }
            return it;
        }
    }

    static String str(Bundle b, String k) { String v = b.getString(k); return v == null ? "" : v; }
    static long num(Bundle b, String k, long fallback) {
        try { return Long.parseLong(str(b, k)); } catch (NumberFormatException e) { return fallback; }
    }
    /** A clip's key is a SHA-256 in hex: it names the cached file, so nothing else may reach a path. */
    static boolean validKey(String k) { return k != null && KEY.matcher(k).matches(); }
    static boolean validUrl(String u) { return u != null && u.startsWith("https://"); }

    /** The queue's order: the more urgent first (reminders already sort after new ones), then the earlier arrival, then first come. */
    static boolean before(Item a, Item b) {
        if (a.priority != b.priority) return a.priority > b.priority;
        if (a.order != b.order) return a.order < b.order;
        return a.seq < b.seq;
    }

    /** The duty screen's chime as 16-bit samples: sine notes, a 15 ms rise to 0.4 and an exponential fall over 0.55 s, then 0.15 s of quiet. */
    static short[] chime(double[] notes) {
        double seconds = 0.03 + (notes.length - 1) * NOTE_GAP + NOTE_LENGTH + 0.15;
        short[] pcm = new short[(int) (seconds * RATE)];
        for (int n = 0; n < pcm.length; n++) {
            double t = n / (double) RATE, v = 0;
            for (int i = 0; i < notes.length; i++) {
                double at = t - 0.03 - i * NOTE_GAP;
                if (at < 0 || at > NOTE_LENGTH + 0.05) continue;
                double gain = at < 0.015 ? 0.0001 * Math.pow(4000, at / 0.015)
                    : at < NOTE_LENGTH ? 0.4 * Math.pow(0.0001 / 0.4, (at - 0.015) / (NOTE_LENGTH - 0.015)) : 0.0001;
                v += Math.sin(2 * Math.PI * notes[i] * at) * gain;
            }
            pcm[n] = (short) Math.round(Math.max(-1, Math.min(1, v)) * 32767);
        }
        return pcm;
    }

    // While an announcement plays the alarm volume is at full (it plays in silent mode too) and other sound is turned
    // down; both go back as they were once the queue is empty. Alarm, so Bluetooth and the phone's speaker both play it.
    private final AudioAttributes attrs = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();

    private final Context ctx;
    private final Runnable onIdle;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final ExecutorService fetcher = Executors.newFixedThreadPool(2);
    // Receipts to the school: one at a time, off the threads that show and say alerts.
    private static final ExecutorService REPORTS = Executors.newSingleThreadExecutor();
    // The drain waiting for a retry's time; a new alert doesn't wait for it.
    private ScheduledFuture<?> later;
    private final List<Item> queue = new ArrayList<>();
    private boolean busy = false;
    private long seq = 0;
    private volatile boolean interrupted = false;
    // Another app or a call has the audio: nothing plays over it until the focus is back or asked for afresh.
    private volatile boolean lost = false;
    private volatile boolean closed = false;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private int alarmBefore = -1;
    private AudioFocusRequest focus;

    GateVoice(Context ctx, Runnable onIdle) {
        this.ctx = ctx.getApplicationContext();
        this.onIdle = onIdle;
        // Made at once, so the phone's voice is ready if a recording isn't.
        tts = new TextToSpeech(this.ctx, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            tts.setAudioAttributes(attrs);
            pickVoice();
            ttsReady = true;
        });
    }

    /**
     * Queues an alert, unless this phone already had it (FCM can deliver a message twice). A newer alert about the same
     * trip replaces one still waiting. False when nothing was queued.
     */
    boolean add(Item it) {
        if (closed || !firstTime(it.outboxId)) return false;
        it.clips = fetcher.submit(() -> fetch(it));
        synchronized (this) {
            if (!it.tag.isEmpty()) queue.removeIf(q -> q.tag.equals(it.tag));
            it.seq = seq++;
            queue.add(it);
            if (!busy) { busy = true; worker.execute(this::drain); }
            // Only an earlier alert's retry was pending: this one is said now, not when that retry is due.
            else if (later != null && later.cancel(false)) { later = null; worker.execute(this::drain); }
        }
        return true;
    }

    synchronized boolean idle() { return !busy; }

    void close() {
        // Stopped by Pause or End duty (or the app): what is still waiting is dropped, not sounded.
        closed = true;
        interrupted = true;
        worker.shutdownNow();
        fetcher.shutdownNow();
        if (tts != null) { tts.stop(); tts.shutdown(); }
        quieten();
    }

    private void drain() {
        while (!closed) {
            Item next = null;
            long wait = Long.MAX_VALUE;
            synchronized (this) {
                long now = System.currentTimeMillis();
                for (Iterator<Item> i = queue.iterator(); i.hasNext(); ) {
                    Item q = i.next();
                    if (q.expires <= now) { i.remove(); Log.i(TAG, "voice expired before it could play"); continue; }
                    if (q.notBefore > now) { wait = Math.min(wait, q.notBefore - now); continue; }
                    if (next == null || before(q, next)) next = q;
                }
                if (next == null) {
                    if (wait != Long.MAX_VALUE) {
                        // Waiting to try again: other sound comes back up meanwhile.
                        quieten();
                        later = worker.schedule(this::drain, wait, TimeUnit.MILLISECONDS);
                        return;
                    }
                    busy = false;
                    break;
                }
                queue.remove(next);
            }
            String how = say(next);
            Log.i(TAG, "voice " + how);
            if ("school".equals(how) || "device".equals(how)) heard(next, how);
            else if (closed) break;
            else if (++next.tries >= MAX_TRIES) unsaid(next);
            else synchronized (this) {
                next.notBefore = System.currentTimeMillis() + RETRY_MS;
                // A newer alert about the same trip came meanwhile: that one is said instead.
                Item retry = next;
                if (queue.stream().noneMatch(q -> !retry.tag.isEmpty() && q.tag.equals(retry.tag))) queue.add(retry);
            }
        }
        quieten();
        main.post(onIdle);
    }

    /** Chime, then the school's recordings, or the phone's voice. "school", "device", "cut" (the audio was taken away) or "silent". */
    private String say(Item it) {
        interrupted = false;
        if (!loud()) return "silent";
        playChime(it.flagged);
        if (interrupted) return "cut";
        File[] files = null;
        try {
            files = it.clips.get(CLIP_WAIT_MS, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            Log.w(TAG, "voice clip not ready: " + e.getClass().getSimpleName());
        }
        if (files == null || files.length == 0) return tts(it.speak);
        for (int i = 0; i < files.length; i++) {
            if (i > 0) sleep(PART_GAP_MS);
            Boolean played = playClip(files[i]);
            if (played == null) return "cut";
            // A clip that won't play: one owner per announcement, so the phone's voice says it from here.
            if (!played) return tts(it.speak);
        }
        return "school";
    }

    private void playChime(boolean flagged) {
        short[] pcm = chime(flagged ? FLAGGED : NORMAL);
        AudioTrack t = null;
        try {
            t = new AudioTrack.Builder().setAudioAttributes(attrs)
                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setTransferMode(AudioTrack.MODE_STATIC).setBufferSizeInBytes(pcm.length * 2).build();
            t.write(pcm, 0, pcm.length);
            t.play();
            sleep(pcm.length * 1000L / RATE);
        } catch (RuntimeException e) {
            Log.w(TAG, "chime failed", e);
        } finally {
            if (t != null) t.release();
        }
    }

    /** True when the clip played to its end, false when it couldn't play, null when the audio was taken away midway. */
    private Boolean playClip(File f) {
        MediaPlayer p = new MediaPlayer();
        CountDownLatch done = new CountDownLatch(1);
        boolean[] failed = { false };
        try {
            p.setAudioAttributes(attrs);
            p.setDataSource(f.getPath());
            p.setOnCompletionListener(x -> done.countDown());
            p.setOnErrorListener((x, what, extra) -> { failed[0] = true; done.countDown(); return true; });
            p.prepare();
            long until = System.currentTimeMillis() + p.getDuration() + 1_500;
            p.start();
            while (done.getCount() > 0 && System.currentTimeMillis() < until) {
                if (interrupted) { p.stop(); return null; }
                done.await(100, TimeUnit.MILLISECONDS);
            }
            return !failed[0];
        } catch (Exception e) {
            Log.w(TAG, "clip failed", e);
            // A broken file must not be kept: the next alert fetches it again.
            if (!f.delete()) Log.w(TAG, "could not drop a broken clip");
            return false;
        } finally {
            p.release();
        }
    }

    private String tts(String text) {
        if (text == null || text.isEmpty()) return "silent";
        for (int i = 0; i < 30 && !ttsReady && !closed; i++) sleep(100);
        if (!ttsReady) { Log.w(TAG, "no phone voice"); return "silent"; }
        CountDownLatch done = new CountDownLatch(1);
        String id = "gate-" + System.nanoTime();
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String u) {}
            @Override public void onDone(String u) { done.countDown(); }
            @Override public void onError(String u) { done.countDown(); }
        });
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) return "silent";
        try {
            for (int i = 0; i < 600 && done.getCount() > 0; i++) {
                if (interrupted) { tts.stop(); return "cut"; }
                done.await(100, TimeUnit.MILLISECONDS);
            }
        } catch (InterruptedException e) {
            return "cut";
        }
        return "device";
    }

    /** The clips, from this phone's cache or the school's store. Null when any of them can't be had. */
    private File[] fetch(Item it) {
        File dir = new File(ctx.getCacheDir(), "voice");
        if (!dir.isDirectory() && !dir.mkdirs()) return null;
        File[] out = new File[it.keys.length];
        for (int i = 0; i < it.keys.length; i++) {
            File f = new File(dir, it.keys[i] + ".mp3");
            // A clip used again counts as new, so trimming the cache never drops the opening every alert shares.
            if (f.isFile()) { if (!f.setLastModified(System.currentTimeMillis())) Log.d(TAG, "clip time not updated"); }
            else if (!download(it.urls[i], f)) return null;
            out[i] = f;
        }
        trim(dir);
        return out;
    }

    private static boolean download(String url, File to) {
        HttpURLConnection c = null;
        File part = null;
        try {
            // Its own temporary file: two alerts can fetch the same clip at once.
            part = File.createTempFile(to.getName(), ".part", to.getParentFile());
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(4_000);
            c.setReadTimeout(4_000);
            if (c.getResponseCode() != 200) { Log.w(TAG, "clip download " + c.getResponseCode()); return false; }
            try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                byte[] buf = new byte[16 * 1024];
                long total = 0;
                for (int n; (n = in.read(buf)) > 0; ) {
                    // A gate sentence is a few seconds of 48 kbit/s MP3, well under 1 MB.
                    if ((total += n) > 2_000_000) return false;
                    os.write(buf, 0, n);
                }
            }
            // The other fetch got there first: the same key is the same recording.
            return part.renameTo(to) || to.isFile();
        } catch (Exception e) {
            Log.w(TAG, "clip download failed: " + e.getClass().getSimpleName());
            return false;
        } finally {
            if (c != null) c.disconnect();
            if (part != null && part.exists() && !part.delete()) Log.w(TAG, "could not drop a partial clip");
        }
    }

    /** Keeps the newest clips only; a clip's key covers the voice and the words, so a kept one is always right. */
    private static void trim(File dir) {
        File[] all = dir.listFiles((d, n) -> n.endsWith(".mp3"));
        if (all == null || all.length <= KEEP_CLIPS) return;
        Arrays.sort(all, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        for (int i = 0; i < all.length - KEEP_CLIPS; i++) if (!all[i].delete()) Log.w(TAG, "could not trim a clip");
    }

    /** Couldn't be said: shown again on the sounding channel while it still matters, so the alert is heard as a notification. */
    private void unsaid(Item it) {
        if (it.data == null || it.expires <= System.currentTimeMillis()) return;
        Log.i(TAG, "voice gave up: notification sounds instead");
        JumpstartMessagingService.show(ctx, it.data, Notif.GATE);
    }

    /** Said in full: remembered for the duty screen's status, reported to the school, and told to the page so it doesn't repeat it at once. */
    private void heard(Item it, String how) {
        prefs(ctx).edit().putLong("lastSpokenAt", System.currentTimeMillis()).putString("lastVoice", how).apply();
        report(it.ack, it.outboxId, it.receipt, "spoken");
        String tag = it.tag.replaceAll("[^A-Za-z0-9-]", "");
        main.post(() -> {
            com.getcapacitor.Bridge b = DutyService.bridge.get();
            if (b != null) b.eval("window.dispatchEvent(new CustomEvent('jumpstart-native-spoke',{detail:{tag:'" + tag + "'}}))", null);
        });
    }

    /** Sends a receipt in the background. */
    static Future<?> report(String ack, long id, String receipt, String event) {
        return REPORTS.submit(() -> receipt(ack, id, receipt, event));
    }

    /** Tells push-send this phone showed or said an alert (0059, 0060). Never throws; the alert matters more than its report. */
    static void receipt(String ack, long id, String receipt, String event) {
        if (!validUrl(ack) || receipt == null || id <= 0) return;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(ack).openConnection();
            c.setConnectTimeout(4_000);
            c.setReadTimeout(4_000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "text/plain");
            byte[] body = new JSONObject().put("id", id).put("receipt", receipt).put("event", event).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) { os.write(body); }
            Log.d(TAG, "receipt " + event + " " + c.getResponseCode());
        } catch (Exception e) {
            Log.w(TAG, "receipt failed: " + e.getClass().getSimpleName());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(JumpstartMessagingService.PREFS, Context.MODE_PRIVATE);
    }

    /** True the first time this phone sees an alert. The last 100 are remembered, across restarts. */
    private boolean firstTime(long outboxId) {
        if (outboxId <= 0) return true;
        synchronized (GateVoice.class) {
            SharedPreferences p = prefs(ctx);
            List<String> seen = new ArrayList<>(Arrays.asList(p.getString("seenAlerts", "").split(",")));
            String id = Long.toString(outboxId);
            if (seen.contains(id)) { Log.i(TAG, "alert already handled"); return false; }
            seen.add(id);
            while (seen.size() > REMEMBER_ALERTS) seen.remove(0);
            p.edit().putString("seenAlerts", TextUtils.join(",", seen)).apply();
            return true;
        }
    }

    /** Asks for the audio (others duck) and turns the alarm volume up. False when a call or another app has the audio. */
    private synchronized boolean loud() {
        if (lost) return false;
        AudioManager am = ctx.getSystemService(AudioManager.class);
        if (am == null) return true;
        try {
            if (focus == null && Build.VERSION.SDK_INT >= 26) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(change -> {
                        // A call or another alarm took the audio: what is playing is cut and said again shortly.
                        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) { interrupted = true; lost = true; }
                        else if (change == AudioManager.AUDIOFOCUS_GAIN) lost = false;
                    }, main)
                    .build();
                if (am.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_FAILED) {
                    focus = null;
                    return false;
                }
            }
            if (alarmBefore < 0) {
                alarmBefore = am.getStreamVolume(AudioManager.STREAM_ALARM);
                am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            }
        } catch (RuntimeException e) {
            // Do Not Disturb or a device policy can refuse; the announcement still plays at the volume there is.
            Log.w(TAG, "could not raise the volume", e);
        }
        return true;
    }

    private synchronized void quieten() {
        AudioManager am = ctx.getSystemService(AudioManager.class);
        if (am == null) return;
        try {
            if (alarmBefore >= 0) am.setStreamVolume(AudioManager.STREAM_ALARM, alarmBefore, 0);
            if (focus != null && Build.VERSION.SDK_INT >= 26) am.abandonAudioFocusRequest(focus);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not restore the volume", e);
        }
        alarmBefore = -1;
        focus = null;
        lost = false;
    }

    /** An en-IN female voice if there is one, else any offline en-IN voice, else en-IN by locale, else the device default. */
    private void pickVoice() {
        try {
            Voice best = null;
            int bestScore = 0;
            if (tts.getVoices() != null) for (Voice v : tts.getVoices()) {
                Locale l = v.getLocale();
                if (!"en".equals(l.getLanguage()) || !"IN".equals(l.getCountry()) || v.isNetworkConnectionRequired()) continue;
                String name = v.getName();
                // Voice names carry no standard gender field; "female" or Google's -enc-/-ene- ids are the best hint there is.
                int score = name.toLowerCase(Locale.ROOT).contains("female") || name.contains("-enc-") || name.contains("-ene-") ? 2 : 1;
                if (score > bestScore) { best = v; bestScore = score; }
            }
            if (best != null) tts.setVoice(best); else tts.setLanguage(Locale.forLanguageTag("en-IN"));
        } catch (RuntimeException e) {
            Log.w(TAG, "voice pick failed", e);
        }
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
