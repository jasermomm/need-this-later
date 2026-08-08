package app.needthislater.mobile;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {
    private JSObject pending;

    @Override
    public void load() {
        capture(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        capture(intent);
        if (pending != null) notifyListeners("shareReceived", pending, true);
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        call.resolve(pending == null ? new JSObject() : pending);
        pending = null;
    }

    @SuppressWarnings("deprecation")
    private void capture(Intent intent) {
        if (intent == null || (!Intent.ACTION_SEND.equals(intent.getAction()) && !Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()))) return;
        JSObject result = new JSObject();
        result.put("mimeType", intent.getType() == null ? "" : intent.getType());
        result.put("text", intent.getStringExtra(Intent.EXTRA_TEXT) == null ? "" : intent.getStringExtra(Intent.EXTRA_TEXT));
        result.put("title", intent.getStringExtra(Intent.EXTRA_SUBJECT) == null ? "" : intent.getStringExtra(Intent.EXTRA_SUBJECT));
        JSArray uris = new JSArray();
        Uri single = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (single != null) uris.put(single.toString());
        ArrayList<Uri> multiple = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (multiple != null) for (Uri uri : multiple) uris.put(uri.toString());
        result.put("uris", uris);
        pending = result;
    }
}
