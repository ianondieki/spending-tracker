package ke.hesabu.app.ui.charts

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

/**
 * RFC 6901 JSON pointers into the FactsSheet. A report's chart section names its data with `data_ref`
 * (`/categories`, `/daily`, `/accounts/0/balance_series`); this resolves it without ever throwing, because the
 * sheet arrives over the network and is untrusted data. Anything that does not resolve cleanly returns null.
 *
 * Also accepts the URI-fragment form (`#/categories`, percent-encoded) since writers sometimes emit it.
 */
object JsonPointer {

    /** The element at [pointer] inside [root], or null when any step is missing, out of range or of the wrong kind. */
    fun resolve(root: JsonElement?, pointer: String?): JsonElement? {
        if (root == null || pointer == null) return null
        var p = pointer.trim()
        if (p.startsWith("#")) p = percentDecode(p.substring(1)) ?: return null
        if (p.isEmpty()) return root
        if (!p.startsWith("/")) return null
        var current: JsonElement = root
        for (raw in p.substring(1).split('/')) {
            val token = raw.replace("~1", "/").replace("~0", "~")
            current = when (current) {
                is JsonObject -> current[token] ?: return null
                is JsonArray -> current.getOrNull(arrayIndex(token) ?: return null) ?: return null
                else -> return null
            }
        }
        return if (current is JsonNull) null else current
    }

    /** The pointer one level up (`/accounts/0/balance_series` gives `/accounts/0`); the root's parent is the root. */
    fun parent(pointer: String): String {
        val p = pointer.trim().removePrefix("#")
        val cut = p.lastIndexOf('/')
        return if (cut <= 0) "" else p.substring(0, cut)
    }

    /** The last reference token, unescaped (`/totals/fees` gives `fees`). */
    fun lastToken(pointer: String): String =
        pointer.trim().substringAfterLast('/').replace("~1", "/").replace("~0", "~")

    /** Array indices are plain decimal with no leading zeros; `-` (one past the end) never resolves to a value. */
    private fun arrayIndex(token: String): Int? {
        if (token.isEmpty() || token.length > 9) return null
        if (token.length > 1 && token[0] == '0') return null
        if (!token.all { it in '0'..'9' }) return null
        return token.toInt()
    }

    private fun percentDecode(s: String): String? {
        if ('%' !in s) return s
        val bytes = java.io.ByteArrayOutputStream()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '%') {
                if (i + 2 >= s.length) return null
                val hex = s.substring(i + 1, i + 3).toIntOrNull(16) ?: return null
                bytes.write(hex)
                i += 3
            } else {
                bytes.write(c.toString().toByteArray(Charsets.UTF_8))
                i++
            }
        }
        return bytes.toString(Charsets.UTF_8.name())
    }
}
