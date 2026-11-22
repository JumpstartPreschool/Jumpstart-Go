package in.jumpstartpreschool.go;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class GateVoiceTest {
    private static GateVoice.Item item(int priority, long order, long seq) {
        GateVoice.Item it = new GateVoice.Item();
        it.priority = priority;
        it.order = order;
        it.seq = seq;
        return it;
    }

    @Test public void queueSaysTheMostUrgentFirstThenTheEarliestArrivalThenFirstCome() {
        assertTrue(GateVoice.before(item(50, 9, 9), item(40, 1, 1)));
        assertTrue(GateVoice.before(item(20, 1, 9), item(20, 2, 1)));
        assertTrue(GateVoice.before(item(20, 1, 1), item(20, 1, 2)));
        // A reminder (priority less 1000, push-send) waits for every new announcement.
        assertTrue(GateVoice.before(item(20, 9, 9), item(50 - 1000, 1, 1)));
    }

    @Test public void chimeIsTheDutyScreensChime() {
        short[] normal = GateVoice.chime(GateVoice.NORMAL);
        short[] flagged = GateVoice.chime(GateVoice.FLAGGED);
        // 0.03 s lead, notes 0.2 s apart lasting 0.55 s, then 0.15 s of quiet (sound.ts).
        assertEquals((int) ((0.03 + 0.2 + 0.55 + 0.15) * GateVoice.RATE), normal.length);
        assertEquals((int) ((0.03 + 0.4 + 0.55 + 0.15) * GateVoice.RATE), flagged.length);
        int peak = 0;
        for (short s : normal) peak = Math.max(peak, Math.abs(s));
        // Two notes overlapping at 0.4 each never clip.
        assertTrue(peak > 0.35 * 32767 && peak < 0.85 * 32767);
        // Silent before the first note and in the quiet tail.
        assertEquals(0, normal[0]);
        for (int i = normal.length - (int) (0.09 * GateVoice.RATE); i < normal.length; i++) assertEquals(0, normal[i]);
    }

    @Test public void onlyHashKeysAndHttpsLinks() {
        assertTrue(GateVoice.validKey("ab12".repeat(16)));
        assertFalse(GateVoice.validKey("../../shared_prefs/jumpstart"));
        assertFalse(GateVoice.validKey("AB12".repeat(16)));
        assertFalse(GateVoice.validKey(null));
        assertTrue(GateVoice.validUrl("https://x.supabase.co/storage/v1/object/sign/voice-audio/sentences/a.mp3?token=t"));
        assertFalse(GateVoice.validUrl("http://x.supabase.co/a.mp3"));
        assertFalse(GateVoice.validUrl("file:///data/data/in.jumpstartpreschool.go/a.mp3"));
    }
}
