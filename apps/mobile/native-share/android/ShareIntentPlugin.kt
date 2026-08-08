package app.needthislater.mobile

import android.content.Intent
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ShareIntent")
class ShareIntentPlugin : Plugin() {
    private var pending: JSObject? = null

    override fun load() {
        super.load()
        capture(activity.intent)
    }

    fun onNewIntent(intent: Intent) {
        capture(intent)
        notifyListeners("shareReceived", pending ?: JSObject(), true)
    }

    @PluginMethod
    fun getPending(call: PluginCall) {
        call.resolve(pending ?: JSObject())
        pending = null
    }

    private fun capture(intent: Intent?) {
        if (intent == null || (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE)) return
        val result = JSObject()
        result.put("mimeType", intent.type ?: "")
        result.put("text", intent.getStringExtra(Intent.EXTRA_TEXT) ?: "")
        result.put("title", intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: "")
        val uris = JSArray()
        intent.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM)?.let { uris.put(it.toString()) }
        intent.getParcelableArrayListExtra<android.net.Uri>(Intent.EXTRA_STREAM)?.forEach { uris.put(it.toString()) }
        result.put("uris", uris)
        pending = result
    }
}
