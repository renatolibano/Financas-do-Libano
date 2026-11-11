package app.libano.mobile;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Gira a tela do app: "landscape" (horizontal), "portrait" (vertical) ou "auto" (volta ao comportamento normal do Android).
@CapacitorPlugin(name = "Orientation")
public class OrientationPlugin extends Plugin {

    @PluginMethod
    public void setMode(final PluginCall call) {
        final String mode = call.getString("mode", "auto");
        final Activity a = getActivity();
        if (a == null) { call.reject("sem activity"); return; }
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                int o;
                if ("landscape".equals(mode)) o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
                else if ("portrait".equals(mode)) o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
                else o = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
                a.setRequestedOrientation(o);
                call.resolve();
            }
        });
    }
}
