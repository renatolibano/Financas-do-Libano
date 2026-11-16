package app.libano.mobile;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

// O WebView do Android ignora downloads feitos por <a download>. Este plugin recebe o arquivo (base64) e:
//  - save():  grava em "Downloads" (Android 10+) ou, em versões antigas, abre o seletor de compartilhar;
//  - share(): abre o seletor de compartilhar do Android com o arquivo.
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private static String cleanName(String n) {
        String s = (n == null || n.trim().isEmpty()) ? "arquivo" : n.trim();
        return s.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private Uri writeToCache(String name, byte[] bytes) throws Exception {
        Context ctx = getContext();
        File dir = new File(ctx.getCacheDir(), "exports");
        if (!dir.exists()) dir.mkdirs();
        File f = new File(dir, name);
        FileOutputStream os = new FileOutputStream(f);
        try { os.write(bytes); } finally { os.close(); }
        return FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
    }

    private void openChooser(Uri uri, String mime) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, "Compartilhar");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("sem dados"); return; }
        String name = cleanName(call.getString("filename"));
        String mime = call.getString("mime", "application/octet-stream");
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            JSObject res = new JSObject();
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                v.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) { call.reject("não foi possível criar o arquivo"); return; }
                OutputStream os = cr.openOutputStream(uri);
                try { os.write(bytes); } finally { if (os != null) os.close(); }
                v.clear();
                v.put(MediaStore.Downloads.IS_PENDING, 0);
                cr.update(uri, v, null, null);
                res.put("saved", true);
                res.put("where", "Downloads");
            } else {
                openChooser(writeToCache(name, bytes), mime);
                res.put("saved", false);
                res.put("where", "share");
            }
            call.resolve(res);
        } catch (Exception e) {
            call.reject("falha ao salvar: " + e.getMessage());
        }
    }

    // Imprimir / salvar como PDF pelo serviço de impressão do Android (window.print() não faz nada no WebView).
    @PluginMethod
    public void printPage(final PluginCall call) {
        final String job = call.getString("title", "Libano");
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    WebView wv = getBridge().getWebView();
                    PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                    PrintDocumentAdapter adapter = wv.createPrintDocumentAdapter(job);
                    pm.print(job, adapter, new PrintAttributes.Builder().build());
                    call.resolve();
                } catch (Exception e) {
                    call.reject("falha ao imprimir: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void share(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("sem dados"); return; }
        String name = cleanName(call.getString("filename"));
        String mime = call.getString("mime", "application/octet-stream");
        try {
            openChooser(writeToCache(name, Base64.decode(data, Base64.DEFAULT)), mime);
            call.resolve();
        } catch (Exception e) {
            call.reject("falha ao compartilhar: " + e.getMessage());
        }
    }
}
