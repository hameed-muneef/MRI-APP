package com.alrabbaniyoon.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * أصوات التذكير التي يختارها المستخدم من ملفاته، منسوخة إلى مساحة التطبيق الخاصة.
 *
 * The web layer sends the bytes (base64) and a key; this class decides whether they are acceptable, writes them to
 * filesDir/custom_sounds/&lt;key&gt;.&lt;ext&gt;, and resolves a stored key back to a playable path. A key that no
 * longer resolves means the bundled tone plays instead, so a deleted or truncated file never rings silence.
 * Nothing leaves the device. The pure decisions are separated from IO for the unit tests.
 */
public final class CustomSounds {

    public static final String DIRECTORY = "custom_sounds";
    /** Hard cap for one sound file. */
    public static final long MAX_BYTES = 10L * 1024 * 1024;
    /** قناة صامتة عالية الأهمية: الصوت نفسه يشغّله التطبيق، فلا يتعارض صوتان. */
    public static final String CUSTOM_CHANNEL_ID = "al-rabbani-reminder-custom-v1";
    public static final String CUSTOM_CHANNEL_NAME = "تذكيرات بصوت مخصص";

    private static final Pattern KEY = Pattern.compile("[a-z0-9_-]{1,64}");
    private static final Set<String> EXTENSIONS = new HashSet<>();
    static {
        EXTENSIONS.add("mp3");
        EXTENSIONS.add("wav");
        EXTENSIONS.add("ogg");
        EXTENSIONS.add("m4a");
        EXTENSIONS.add("aac");
        EXTENSIONS.add("flac");
        EXTENSIONS.add("opus");
        EXTENSIONS.add("webm");
    }

    private CustomSounds() {}

    /** Pure: the key the web layer may use, lowercase letters, digits, dash and underscore, 1..64. */
    public static boolean isValidKey(String key) {
        return key != null && KEY.matcher(key).matches();
    }

    /** Pure: only the formats the platform plays reliably. */
    public static boolean isValidExt(String ext) {
        return ext != null && EXTENSIONS.contains(ext.toLowerCase(Locale.US));
    }

    /** Pure: the stored file name for one key, or null when the key or the extension is not allowed. */
    public static String fileName(String key, String ext) {
        if (!isValidKey(key) || !isValidExt(ext)) return null;
        return key + "." + ext.toLowerCase(Locale.US);
    }

    /** Pure: a sound file must be non-empty and no larger than {@link #MAX_BYTES}. */
    public static boolean isValidSize(long bytes) {
        return bytes > 0 && bytes <= MAX_BYTES;
    }

    /** Pure: a res/raw name as we accept it: lowercase letters, digits and underscore, 1..64, no extension. */
    public static String sanitizeRawSound(String rawSound) {
        if (rawSound == null) return "";
        String value = rawSound.trim().toLowerCase(Locale.US);
        if (value.endsWith(".ogg") || value.endsWith(".mp3")) value = value.substring(0, value.lastIndexOf('.'));
        if (value.isEmpty() || value.length() > 64) return "";
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            boolean ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_';
            if (!ok) return "";
        }
        return value;
    }

    /** Pure: the key part of a stored soundKey ("abc.mp3" → "abc"), or null when the name is not one we wrote. */
    public static String keyOf(String soundKey) {
        if (soundKey == null) return null;
        int dot = soundKey.lastIndexOf('.');
        if (dot <= 0) return null;
        String key = soundKey.substring(0, dot);
        String ext = soundKey.substring(dot + 1);
        return isValidKey(key) && isValidExt(ext) ? key : null;
    }

    /** Pure: is this stored name safe to resolve inside the app's own directory? */
    public static boolean isSafeSoundKey(String soundKey) {
        if (soundKey == null || soundKey.isEmpty()) return false;
        if (soundKey.contains("/") || soundKey.contains("\\") || soundKey.contains("..")) return false;
        String key = keyOf(soundKey);
        return key != null && fileName(key, soundKey.substring(soundKey.lastIndexOf('.') + 1)) != null;
    }

    public static File directory(Context context) {
        File dir = new File(context.getFilesDir(), DIRECTORY);
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    /** Writes one sound atomically. Returns the stored soundKey ("key.ext"), or null when refused. */
    public static String write(Context context, String key, String ext, byte[] bytes) {
        String name = fileName(key, ext);
        if (name == null || bytes == null || !isValidSize(bytes.length)) return null;
        File target = new File(directory(context), name);
        File temp = new File(target.getAbsolutePath() + ".part");
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(temp);
            out.write(bytes);
            out.flush();
            out.close();
            out = null;
            if (target.exists() && !target.delete()) return null;
            return temp.renameTo(target) ? name : null;
        } catch (Throwable t) {
            //noinspection ResultOfMethodCallIgnored
            temp.delete();
            return null;
        } finally {
            try { if (out != null) out.close(); } catch (Throwable ignored) {}
        }
    }

    /** The path for a stored soundKey, or null when it is unsafe, missing or empty. */
    public static String pathFor(Context context, String soundKey) {
        if (!isSafeSoundKey(soundKey)) return null;
        File file = new File(directory(context), soundKey);
        if (!file.isFile() || file.length() <= 0) return null;
        return file.getAbsolutePath();
    }

    /** Deletes every stored sound whose name is not in {@code keep}. Returns how many were removed. */
    public static int prune(Context context, List<String> keep) {
        Set<String> keepSet = new HashSet<>();
        for (String name : keep) {
            if (isSafeSoundKey(name)) keepSet.add(name);
        }
        File[] files = directory(context).listFiles();
        if (files == null) return 0;
        int removed = 0;
        for (File file : files) {
            if (file == null || !file.isFile()) continue;
            if (keepSet.contains(file.getName())) continue;
            if (file.delete()) removed++;
        }
        return removed;
    }

    /** قناة صامتة عالية الأهمية لصوت مخصص يُشغّله التطبيق مرة واحدة. */
    public static void ensureCustomChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm == null || nm.getNotificationChannel(CUSTOM_CHANNEL_ID) != null) return;
            NotificationChannel channel = new NotificationChannel(
                CUSTOM_CHANNEL_ID, CUSTOM_CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("تذكيرات بصوت اخترته من ملفاتك: يشغّله التطبيق مرة واحدة");
            channel.setSound(null, null);
            channel.enableVibration(true);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(channel);
        } catch (Throwable ignored) {}
    }
}
