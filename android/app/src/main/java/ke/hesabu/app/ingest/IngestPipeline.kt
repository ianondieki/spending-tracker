package ke.hesabu.app.ingest

import android.util.Log
import ke.hesabu.app.data.AccountEntity
import ke.hesabu.app.data.BodyCipher
import ke.hesabu.app.data.Categoriser
import ke.hesabu.app.data.HesabuDatabase
import ke.hesabu.app.data.SyncQueueEntity
import ke.hesabu.app.data.TransactionEntity
import ke.hesabu.app.data.UnknownMessageEntity
import ke.hesabu.app.parse.pack.InboundMessage
import ke.hesabu.app.parse.pack.PackEngine
import ke.hesabu.app.parse.pack.ParseResult
import ke.hesabu.app.parse.pack.ParsedTransaction
import ke.hesabu.app.parse.pack.PostProcessor
import java.util.UUID

/**
 * The on-device pipeline from master prompt §6: sender filter → family match → fields → normalise → dedupe →
 * transfer matching → balance chain → category → local store → sync queue. Every entry point (live SMS, backfill,
 * reconciliation, share, paste, demo) goes through [ingest], so they all behave identically.
 *
 * Logging: counts only. No sender, no body, no amount ever reaches a log line.
 */
class IngestPipeline(
    private val db: HesabuDatabase,
    private val engine: PackEngine,
    private val bodyCipher: BodyCipher,
    private val now: () -> Long = System::currentTimeMillis,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {

    data class Report(
        val received: Int = 0,
        val parsed: Int = 0,
        val ignored: Int = 0,
        val unknown: Int = 0,
        val unknownUnstored: Int = 0,
        val duplicates: Int = 0,
        val notMoneySender: Int = 0,
        val transfersPaired: Int = 0,
        val balanceBreaks: Int = 0,
        /** New ledger rows per sender address (for backfill progress), lower-cased. */
        val perSender: Map<String, Int> = emptyMap(),
        val newTransactionIds: List<String> = emptyList(),
    ) {
        operator fun plus(o: Report) = Report(
            received + o.received, parsed + o.parsed, ignored + o.ignored, unknown + o.unknown, unknownUnstored + o.unknownUnstored,
            duplicates + o.duplicates, notMoneySender + o.notMoneySender, transfersPaired + o.transfersPaired,
            balanceBreaks + o.balanceBreaks,
            (perSender.keys + o.perSender.keys).associateWith { (perSender[it] ?: 0) + (o.perSender[it] ?: 0) },
            newTransactionIds + o.newTransactionIds,
        )
    }

    suspend fun ingest(message: InboundMessage): Report = ingest(listOf(message))

    /** Stores messages as unknown without parsing (shared text no pack claims). */
    suspend fun storeUnknown(messages: List<InboundMessage>): Report {
        val t0 = now()
        val known = HashSet<String>()
        messages.map { it.rawHash }.distinct().chunked(500).forEach { c -> known.addAll(db.unknownMessageDao().existingHashes(c)) }
        var unstored = 0
        val rows = messages.filter { it.rawHash !in known }.distinctBy { it.rawHash }.mapNotNull { m ->
            val blob = runCatching { bodyCipher.encrypt(m.body) }.getOrElse { unstored++; return@mapNotNull null }
            UnknownMessageEntity(newId(), m.sender.trim(), blob, m.receivedAtMillis, m.rawHash, packIds = "", source = m.source.wire, updatedAtMillis = t0)
        }
        if (rows.isNotEmpty()) db.unknownMessageDao().insertAll(rows)
        return Report(received = messages.size, unknown = rows.size, unknownUnstored = unstored, duplicates = messages.size - rows.size - unstored)
    }

    /** [tags] are stamped on every new row (demo mode uses "demo" so its rows can be removed again). */
    suspend fun ingest(messages: List<InboundMessage>, tags: List<String> = emptyList()): Report {
        if (messages.isEmpty()) return Report()
        val t0 = now()
        val results = messages.map { it to engine.parse(it) }

        val parsed = results.mapNotNull { (m, r) -> (r as? ParseResult.Parsed)?.let { m to it.transaction } }
        val unknowns = results.mapNotNull { (m, r) -> (r as? ParseResult.Unknown)?.let { m to it } }
        val ignored = results.count { it.second is ParseResult.Ignored }
        val notMoney = results.count { it.second is ParseResult.NotMoneySender }

        // Dedupe: (provider, external_ref) then raw_hash, against the ledger and within the batch.
        val existing = HashSet<String>()
        parsed.map { it.second.rawHash }.distinct().chunked(500).forEach { c -> db.transactionDao().existingHashes(c).forEach { existing.add("hash:$it") } }
        parsed.groupBy { it.second.provider }.forEach { (provider, list) ->
            list.mapNotNull { it.second.externalRef }.distinct().chunked(500).forEach { c ->
                db.transactionDao().existingExternalRefs(provider, c).forEach { existing.add("ref:$provider:$it") }
            }
        }
        val categoriser = Categoriser(db.userRuleDao().all(), db.merchantSeedDao().all())
        val tagsJson = ke.hesabu.app.sync.WireMapper.tagsToJson(tags)
        val candidates = parsed.map { (m, tx) -> toEntity(tx, categoriser, m).copy(tags = tagsJson) }
        val deduped = PostProcessor.dedupe(candidates, existing)
        val inserted = db.transactionDao().insertAll(deduped.kept)
        val newRows = deduped.kept.filterIndexed { i, _ -> inserted[i] != -1L }
        val duplicates = deduped.droppedCount + (deduped.kept.size - newRows.size)

        upsertAccounts(newRows)
        val paired = matchTransfers(newRows)
        val breaks = checkBalances(newRows)
        db.syncQueueDao().enqueueAll(newRows.map { SyncQueueEntity(it.id, t0) })

        // Unknown messages: encrypted body, deduped by hash, counted per sender.
        val unknownHashes = unknowns.map { it.first.rawHash }.distinct()
        val knownUnknown = HashSet<String>()
        unknownHashes.chunked(500).forEach { c -> knownUnknown.addAll(db.unknownMessageDao().existingHashes(c)) }
        var unstored = 0
        val unknownRows = unknowns.filter { it.first.rawHash !in knownUnknown }.distinctBy { it.first.rawHash }.mapNotNull { (m, u) ->
            val blob = runCatching { bodyCipher.encrypt(m.body) }.getOrElse { unstored++; return@mapNotNull null }
            UnknownMessageEntity(
                id = newId(), sender = m.sender.trim(), bodyEncrypted = blob, receivedAtMillis = m.receivedAtMillis,
                rawHash = m.rawHash, packIds = u.packIds.joinToString(","), source = m.source.wire, updatedAtMillis = t0,
            )
        }
        if (unknownRows.isNotEmpty()) db.unknownMessageDao().insertAll(unknownRows)

        val perSender = HashMap<String, Int>()
        newRows.forEach { row -> parsed.firstOrNull { it.second.rawHash == row.rawHash }?.let { perSender.merge(it.first.sender.trim().lowercase(), 1, Int::plus) } }

        val report = Report(
            received = messages.size, parsed = newRows.size, ignored = ignored, unknown = unknownRows.size, unknownUnstored = unstored,
            duplicates = duplicates, notMoneySender = notMoney, transfersPaired = paired, balanceBreaks = breaks,
            perSender = perSender, newTransactionIds = newRows.map { it.id },
        )
        Log.i(TAG, "ingested ${report.received}: parsed=${report.parsed} ignored=${report.ignored} unknown=${report.unknown} dup=${report.duplicates} other=${report.notMoneySender} pairs=${report.transfersPaired} breaks=${report.balanceBreaks}")
        return report
    }

    private fun toEntity(tx: ParsedTransaction, categoriser: Categoriser, m: InboundMessage): TransactionEntity {
        val cat = categoriser.resolve(tx)
        val t = now()
        return TransactionEntity(
            id = newId(),
            accountRef = tx.accountRef,
            provider = tx.provider,
            externalRef = tx.externalRef,
            type = tx.type,
            direction = tx.direction,
            amountCents = tx.amountCents,
            feeCents = tx.feeCents,
            balanceAfterCents = tx.balanceAfterCents,
            occurredAtMillis = tx.occurredAtMillis,
            receivedAtMillis = tx.receivedAtMillis,
            counterpartyName = tx.counterpartyName,
            counterpartyKind = tx.counterpartyKind,
            counterpartyRefMasked = tx.counterpartyRef,
            paybill = tx.paybill,
            till = tx.till,
            counterpartyAccountRef = tx.counterpartyAccountRef,
            categoryId = cat.categoryId,
            categorySource = cat.source,
            categoryConfidence = cat.confidence,
            isTransfer = cat.markTransfer,
            isTransferHint = tx.isTransferHint,
            transferPairId = null,
            parseConfidence = tx.parseConfidence,
            source = m.source.wire,
            rawHash = tx.rawHash,
            packId = tx.packId,
            packVersion = tx.packVersion,
            familyId = tx.familyId,
            userEdited = false,
            note = tx.note,
            updatedAtMillis = t,
        )
    }

    private suspend fun upsertAccounts(rows: List<TransactionEntity>) {
        val t = now()
        rows.groupBy { it.accountRef }.forEach { (ref, list) ->
            val latest = list.maxByOrNull { it.occurredAtMillis }!!
            val withBalance = list.filter { it.balanceAfterCents != null }.maxByOrNull { it.occurredAtMillis }
            val current = db.accountDao().byRef(ref)
            val label = current?.label ?: defaultLabel(latest.provider, ref)
            val newer = current == null || (withBalance != null && (current.lastBalanceAtMillis ?: Long.MIN_VALUE) <= withBalance.occurredAtMillis)
            db.accountDao().upsert(
                AccountEntity(
                    accountRef = ref,
                    provider = latest.provider,
                    institution = current?.institution ?: institutionFor(latest.provider),
                    label = label,
                    mask = current?.mask ?: ref.substringAfterLast(':').takeIf { it != "default" },
                    lastBalanceCents = if (newer && withBalance != null) withBalance.balanceAfterCents else current?.lastBalanceCents,
                    lastBalanceAtMillis = if (newer && withBalance != null) withBalance.occurredAtMillis else current?.lastBalanceAtMillis,
                    lastMessageAtMillis = maxOf(current?.lastMessageAtMillis ?: 0L, latest.occurredAtMillis),
                    updatedAtMillis = t,
                ),
            )
        }
    }

    /** Pairs new rows with each other and with ledger rows inside the ten-minute window. */
    private suspend fun matchTransfers(newRows: List<TransactionEntity>): Int {
        if (newRows.isEmpty()) return 0
        val from = newRows.minOf { it.occurredAtMillis } - PostProcessor.TRANSFER_WINDOW_MS
        val to = newRows.maxOf { it.occurredAtMillis } + PostProcessor.TRANSFER_WINDOW_MS
        val window = db.transactionDao().between(from, to + 1).filter { it.transferPairId == null && !it.userEdited }
        val pairs = PostProcessor.matchTransfers(window) { a, _ -> a.id }
        if (pairs.isEmpty()) return 0
        val t = now()
        val updated = window.filter { it.id in pairs }.map { it.copy(isTransfer = true, transferPairId = pairs[it.id], updatedAtMillis = t, syncedAtMillis = null) }
        db.transactionDao().updateAll(updated)
        db.syncQueueDao().enqueueAll(updated.map { SyncQueueEntity(it.id, t) })
        return updated.size / 2
    }

    /** Flags balance breaks for the accounts touched; advisory, never alters amounts. */
    private suspend fun checkBalances(newRows: List<TransactionEntity>): Int {
        var flagged = 0
        newRows.filter { it.balanceAfterCents != null }.groupBy { it.accountRef }.forEach { (ref, list) ->
            val since = list.minOf { it.occurredAtMillis } - 7L * 24 * 3600 * 1000
            val rows = db.transactionDao().forAccountSince(ref, since)
            val breaks = PostProcessor.checkBalanceChain(rows).map { it.id }.toSet()
            val changes = rows.filter { (it.id in breaks) != it.balanceBreak }.map { it.copy(balanceBreak = it.id in breaks) }
            if (changes.isNotEmpty()) db.transactionDao().updateAll(changes)
            flagged += breaks.count { id -> list.any { it.id == id } }
        }
        return flagged
    }

    companion object {
        private const val TAG = "Ingest"

        fun defaultLabel(provider: String, ref: String): String = when (provider) {
            "mpesa" -> "M-PESA"
            "airtel_money" -> "Airtel Money"
            "tkash" -> "T-Kash"
            "bank" -> ref.split(':').getOrNull(1)?.replaceFirstChar { it.uppercase() } ?: "Bank"
            "card" -> "Card"
            "wallet" -> "Wallet"
            else -> provider
        }

        fun institutionFor(provider: String): String? = when (provider) {
            "mpesa" -> "Safaricom"
            "airtel_money" -> "Airtel"
            "tkash" -> "Telkom"
            else -> null
        }
    }
}
