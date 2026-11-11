package app.libano.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Ao registrar plugins do app aqui, o Capacitor pode deixar de carregar sozinho os plugins do npm
        // (capacitor.plugins.json) — então registramos todos explicitamente.
        registerPlugin(com.capacitorjs.plugins.app.AppPlugin.class);
        registerPlugin(com.capacitorjs.plugins.browser.BrowserPlugin.class);
        registerPlugin(com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin.class);
        registerPlugin(io.github.jofr.capacitor.mediasessionplugin.MediaSessionPlugin.class);
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(BackgroundPlugin.class);
        registerPlugin(OrientationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
