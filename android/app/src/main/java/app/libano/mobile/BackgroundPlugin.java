package app.libano.mobile;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.net.wifi.WifiManager;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Pede ao Android para não "dormir" o app (economia de bateria), senão os lembretes não tocam com o app fechado.
@CapacitorPlugin(name = "Background")
public class BackgroundPlugin extends Plugin {

    @PluginMethod
    public void allowIgnoreBattery(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null && !pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                r.put("asked", true);
            } else r.put("asked", false);
        } catch (Exception e) { r.put("asked", false); }
        call.resolve(r);
    }

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    // Mantém CPU e Wi-Fi acordados enquanto o áudio toca em segundo plano (liga/desliga pelo JS).
    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            Context ctx = getContext().getApplicationContext();
            if (on) {
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                if (pm != null && wakeLock == null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "libano:playback");
                    wakeLock.setReferenceCounted(false);
                }
                if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(6 * 60 * 60 * 1000L); // segurança: solta sozinho em 6 h
                WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
                if (wm != null && wifiLock == null) {
                    wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "libano:playback");
                    wifiLock.setReferenceCounted(false);
                }
                if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
            } else {
                if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
            }
        } catch (Exception ignored) { /* sem permissão ou serviço: segue sem o lock */ }
        call.resolve();
    }
}
