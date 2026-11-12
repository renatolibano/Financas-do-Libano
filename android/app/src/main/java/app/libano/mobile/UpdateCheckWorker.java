package app.libano.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

// Confere a última release do GitHub em segundo plano (com o app fechado) e avisa por notificação se houver versão nova.
// Agendado por BackgroundPlugin.scheduleUpdateCheck (repo e nome do APK vêm do app-config.json via JS).
public class UpdateCheckWorker extends Worker {
    static final String PREFS = "libano_update";
    private static final String CHANNEL = "libano-lembretes"; // mesmo canal das outras notificações do app
    private static final int NOTIF_ID = 888888801;            // mesmo id do aviso imediato do JS (clearUpdateNotifications também o fecha)

    public UpdateCheckWorker(@NonNull Context ctx, @NonNull WorkerParameters params) { super(ctx, params); }

    @NonNull
    @Override
    public Result doWork() {
        try { check(); } catch (Exception ignored) { /* sem rede / API fora do ar: tenta de novo no próximo ciclo */ }
        return Result.success();
    }

    private void check() throws Exception {
        Context ctx = getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String repo = sp.getString("repo", "");
        String apkName = sp.getString("apkName", "libano.apk");
        if (repo.isEmpty()) return;

        HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/" + repo + "/releases/latest").openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        c.setRequestProperty("User-Agent", "libano-app");
        if (c.getResponseCode() != 200) return;
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        } finally { c.disconnect(); }

        JSONObject rel = new JSONObject(sb.toString());
        String version = rel.optString("tag_name", "").replaceFirst("^[vV]", "");
        boolean hasApk = false;
        JSONArray assets = rel.optJSONArray("assets");
        if (assets != null) for (int i = 0; i < assets.length(); i++) {
            if (apkName.equals(assets.getJSONObject(i).optString("name"))) { hasApk = true; break; }
        }
        String current = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        if (version.isEmpty() || !hasApk || !isNewer(version, current)) return;

        // Avisa 1x por versão e repete no máximo a cada 24 h até atualizar.
        long now = System.currentTimeMillis();
        boolean sameVersion = version.equals(sp.getString("notifiedVersion", ""));
        if (sameVersion && now - sp.getLong("notifiedAt", 0) < 24L * 60 * 60 * 1000) return;
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return;

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Lembretes e metas", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
        // Tocar abre o app; o UpdateBanner confere a versão ao abrir e mostra a janela de atualização.
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setContentTitle("Nova versão do Libano disponível")
            .setContentText("A versão " + version + " está pronta. Toque para atualizar.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi)
            .setAutoCancel(true);
        nm.notify(NOTIF_ID, b.build());
        sp.edit().putString("notifiedVersion", version).putLong("notifiedAt", now).apply();
    }

    private static int[] parse(String v) {
        String[] p = v.replaceFirst("^[vV]", "").split("\\.");
        int[] o = new int[3];
        for (int i = 0; i < 3 && i < p.length; i++) {
            try { o[i] = Integer.parseInt(p[i].replaceAll("\\D.*$", "")); } catch (Exception ignored) { o[i] = 0; }
        }
        return o;
    }

    private static boolean isNewer(String a, String b) {
        int[] x = parse(a), y = parse(b);
        for (int i = 0; i < 3; i++) if (x[i] != y[i]) return x[i] > y[i];
        return false;
    }
}
