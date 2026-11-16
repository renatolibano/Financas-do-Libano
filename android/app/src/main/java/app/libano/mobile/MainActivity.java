package app.libano.mobile;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
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
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);

        // Telas cortadas em celulares novos: no Android 15+ (e em aparelhos com recorte de câmera, gestos ou barra de 3 botões)
        // o app pode ser desenhado por baixo das barras do sistema. Aqui o conteúdo recebe de volta, como margem, exatamente o
        // espaço que o sistema ocupa (barras + recorte + teclado), seja qual for o tamanho/formato do aparelho. Quando o sistema
        // já reserva esse espaço, os valores chegam zerados e nada muda.
        final View content = findViewById(android.R.id.content);
        content.setBackgroundColor(0xFF0B0D12);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        // Ícones claros nas barras do sistema (o app é escuro).
        WindowCompat.getInsetsController(getWindow(), content).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(getWindow(), content).setAppearanceLightNavigationBars(false);
    }
}
