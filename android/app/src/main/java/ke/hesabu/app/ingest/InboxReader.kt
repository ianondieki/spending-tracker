package ke.hesabu.app.ingest

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.provider.Telephony
import ke.hesabu.app.parse.pack.InboundMessage
import ke.hesabu.app.parse.pack.MessageSource

/**
 * Paged reads of the SMS inbox through the ContentResolver, restricted at the query to the sender ids the packs
 * know, so messages from anyone else are never read into memory. Needs READ_SMS; callers check first.
 */
class InboxReader(private val context: Context) {

    data class Page(val messages: List<InboundMessage>, val lastId: Long?)

    /** Address column compared lower-cased and trimmed, as the pack sender filter does. */
    private fun selection(knownSenders: Collection<String>, sinceMillis: Long, afterId: Long): Pair<String, Array<String>> {
        val placeholders = knownSenders.joinToString(",") { "?" }
        val sel = "LOWER(TRIM(${Telephony.Sms.ADDRESS})) IN ($placeholders) AND ${Telephony.Sms.DATE} >= ? AND ${Telephony.Sms._ID} > ?"
        val args = knownSenders.map { it.lowercase() }.toTypedArray() + arrayOf(sinceMillis.toString(), afterId.toString())
        return sel to args
    }

    /** Counts matching rows without reading bodies. */
    fun count(knownSenders: Collection<String>, sinceMillis: Long): Int {
        if (knownSenders.isEmpty()) return 0
        val (sel, args) = selection(knownSenders, sinceMillis, -1)
        context.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI, arrayOf(Telephony.Sms._ID), sel, args, null)?.use { return it.count }
        return 0
    }

    /** One page ordered by _id ascending, starting after [afterId]. */
    fun page(knownSenders: Collection<String>, sinceMillis: Long, afterId: Long, pageSize: Int = PAGE_SIZE): Page {
        if (knownSenders.isEmpty()) return Page(emptyList(), null)
        val (sel, args) = selection(knownSenders, sinceMillis, afterId)
        val projection = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
        val queryArgs = Bundle().apply {
            putString(ContentResolver.QUERY_ARG_SQL_SELECTION, sel)
            putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args)
            putString(ContentResolver.QUERY_ARG_SQL_SORT_ORDER, "${Telephony.Sms._ID} ASC")
            putInt(ContentResolver.QUERY_ARG_LIMIT, pageSize)
        }
        val out = ArrayList<InboundMessage>(pageSize)
        var last: Long? = null
        context.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI, projection, queryArgs, null)?.use { c ->
            val iId = c.getColumnIndexOrThrow(Telephony.Sms._ID)
            val iAddr = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val iBody = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val iDate = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
            while (c.moveToNext() && out.size < pageSize) {
                val id = c.getLong(iId)
                last = id
                val addr = c.getString(iAddr) ?: continue
                val body = c.getString(iBody) ?: continue
                out.add(InboundMessage(addr, body, c.getLong(iDate), MessageSource.Sms))
            }
        }
        return Page(out, last)
    }

    /** Streams every matching message since [sinceMillis], page by page; [onPage] returns false to stop. */
    inline fun forEachPage(knownSenders: Collection<String>, sinceMillis: Long, onPage: (List<InboundMessage>) -> Boolean) {
        var after = -1L
        while (true) {
            val p = page(knownSenders, sinceMillis, after)
            if (p.messages.isEmpty() || p.lastId == null) return
            if (!onPage(p.messages)) return
            after = p.lastId
        }
    }

    companion object {
        const val PAGE_SIZE = 200
        val INBOX: Uri = Telephony.Sms.Inbox.CONTENT_URI
    }
}
