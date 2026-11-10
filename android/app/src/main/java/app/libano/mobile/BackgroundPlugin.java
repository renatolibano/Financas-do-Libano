package app.libano.mobile;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
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
}
