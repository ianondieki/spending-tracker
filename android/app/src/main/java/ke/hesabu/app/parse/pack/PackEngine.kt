package ke.hesabu.app.parse.pack

/**
 * Executes provider packs exactly as PROVIDER-PACKS.md and packages/pack-engine (the TypeScript reference) do:
 * sender filter → first pack claiming the sender decides → families in order (prefilter, then pattern) → fields →
 * normalisers → outputs. Mirrors the reference engine's clarifications: U+00A0 becomes a space before matching
 * (the raw hash is of the untouched body), bodies over [MAX_BODY_LENGTH] are unknown, later non-null groups
 * feeding one field win, ids are deterministic.
 *
 * [deviceVars] fills `account_ref_template` placeholders such as `{sim_msisdn_masked}`; they come from the device,
 * never from the message. A missing variable becomes `default` so the account key is still stable.
 */
class PackEngine(
    packs: List<ProviderPack>,
    private val deviceVars: Map<String, String> = emptyMap(),
) {
    private val compiled: List<CompiledPack> = packs.map { CompiledPack(it) }
    private val bySender: Map<String, CompiledPack> = buildMap {
        compiled.forEach { cp -> cp.pack.senderKeys.forEach { key -> putIfAbsent(key, cp) } }
    }

    val packs: List<ProviderPack> get() = compiled.map { it.pack }

    /** Every sender id any pack claims, lower-cased: the inbox backfill reads only these. */
    val knownSenders: Set<String> get() = bySender.keys

    fun isKnownSender(sender: String): Boolean = senderKey(sender) in bySender

    /** The account key a message from [sender] would be filed under, or null. */
    fun accountRefFor(sender: String): String? = bySender[senderKey(sender)]?.let { fillTemplate(it.pack.accountRefTemplate, deviceVars) }

    fun providerFor(sender: String): String? = bySender[senderKey(sender)]?.pack?.provider

    fun parse(message: InboundMessage): ParseResult {
        val cp = bySender[senderKey(message.sender)] ?: return ParseResult.NotMoneySender
        return cp.evaluate(message, deviceVars)
    }

    fun parseAll(messages: List<InboundMessage>): List<ParseResult> = messages.map(::parse)

    private fun senderKey(sender: String) = sender.trim().lowercase()

    private class CompiledFamily(val family: Family, val regex: PortableRegex.Compiled) {
        val allOf = family.prefilter?.allOf?.map { it.lowercase() } ?: emptyList()
        val noneOf = family.prefilter?.noneOf?.map { it.lowercase() } ?: emptyList()
        fun prefilterPasses(lowerBody: String) = allOf.all { lowerBody.contains(it) } && noneOf.none { lowerBody.contains(it) }
    }

    private class Fields {
        var externalRef: String? = null
        var amountCents: Long? = null
        var feeCents: Long? = null
        var balanceAfterCents: Long? = null
        var occurredAt: String? = null
        var counterpartyName: String? = null
        var counterpartyRef: String? = null
        var paybill: String? = null
        var till: String? = null
        var accountRef: String? = null
        var note: String? = null
    }

    private class CompiledPack(val pack: ProviderPack) {
        val families: List<CompiledFamily> = pack.families.map { f ->
            CompiledFamily(f, PortableRegex.compile(f.pattern)).also { cf ->
                val missing = f.fields.keys.filter { it !in cf.regex.groupNames }
                require(missing.isEmpty()) { "pack ${pack.packId} family ${f.familyId}: fields $missing are not groups in the pattern" }
                require(f.ignore || f.fields.values.any { it.to == "amount" }) { "pack ${pack.packId} family ${f.familyId}: a non-ignore family must map an amount" }
            }
        }

        fun evaluate(message: InboundMessage, deviceVars: Map<String, String>): ParseResult {
            val rawHash = message.rawHash
            if (message.body.length > MAX_BODY_LENGTH) return ParseResult.Unknown(listOf(pack.packId))
            val body = matchableBody(message.body)
            val lowerBody = body.lowercase()
            for (cf in families) {
                if (!cf.prefilterPasses(lowerBody)) continue
                val groups = cf.regex.find(body) ?: continue
                val fields = extract(cf.family, groups) ?: continue
                if (cf.family.ignore) {
                    return ParseResult.Ignored(pack.packId, pack.version, cf.family.familyId, rawHash, fields.amountCents, fields.balanceAfterCents, fields.occurredAt, fields.externalRef)
                }
                val amount = fields.amountCents ?: continue
                val family = cf.family
                return ParseResult.Parsed(
                    ParsedTransaction(
                        id = Ids.transactionId(pack.packId, family.familyId, rawHash),
                        packId = pack.packId,
                        packVersion = pack.version,
                        familyId = family.familyId,
                        provider = pack.provider,
                        accountRef = fillTemplate(pack.accountRefTemplate, deviceVars),
                        type = family.type,
                        direction = family.direction,
                        counterpartyKind = family.counterpartyKind,
                        isTransferHint = family.isTransferHint,
                        amountCents = amount,
                        feeCents = fields.feeCents ?: family.defaults?.feeCents ?: 0L,
                        balanceAfterCents = fields.balanceAfterCents,
                        occurredAt = fields.occurredAt ?: message.receivedAtText,
                        externalRef = fields.externalRef,
                        counterpartyName = fields.counterpartyName ?: family.defaults?.counterpartyName,
                        counterpartyRef = fields.counterpartyRef,
                        paybill = fields.paybill,
                        till = fields.till,
                        counterpartyAccountRef = fields.accountRef,
                        note = fields.note,
                        parseConfidence = family.confidence,
                        defaultCategoryId = family.defaults?.categoryId,
                        rawHash = rawHash,
                        receivedAtMillis = message.receivedAtMillis,
                        source = message.source,
                    ),
                )
            }
            return ParseResult.Unknown(listOf(pack.packId))
        }

        /** Null when a required group is missing or cannot be normalised: the family fails and evaluation moves on. */
        private fun extract(family: Family, groups: Map<String, String?>): Fields? {
            val out = Fields()
            for ((group, mapping) in family.fields) {
                val raw = groups[group]
                val value: Any? = if (raw == null) null else when (mapping.normalise) {
                    "amount" -> Normalisers.amount(raw, pack.amountPrefixes)
                    "datetime" -> Normalisers.datetime(raw, pack.datetimeFormats)
                    "text" -> Normalisers.text(raw)
                    "phone" -> Normalisers.phone(raw)
                    "code" -> Normalisers.code(raw)
                    "digits" -> Normalisers.digits(raw)
                    else -> null
                }
                if (value == null) {
                    if (mapping.optional) continue
                    return null
                }
                val str = value.toString()
                when (mapping.to) {
                    "amount" -> (value as? Long)?.let { out.amountCents = it }
                    "fee" -> (value as? Long)?.let { out.feeCents = it }
                    "balance_after" -> (value as? Long)?.let { out.balanceAfterCents = it }
                    "external_ref" -> out.externalRef = str
                    "occurred_at" -> out.occurredAt = str
                    "counterparty_name" -> out.counterpartyName = str
                    "counterparty_ref" -> out.counterpartyRef = str
                    "paybill" -> out.paybill = str
                    "till" -> out.till = str
                    "account_ref" -> out.accountRef = Normalisers.maskAccountRef(str)
                    "note" -> out.note = str
                }
            }
            return out
        }
    }

    companion object {
        /** A concatenated SMS is at most ~1,500 characters; anything longer is never matched (bounded regex work on untrusted text). */
        const val MAX_BODY_LENGTH = 4000

        /** U+00A0 becomes a plain space before matching, because Java's `\s` excludes it and JavaScript's includes it. */
        fun matchableBody(body: String): String = body.replace(' ', ' ')

        fun fillTemplate(template: String, vars: Map<String, String>): String =
            Regex("""\{([a-z0-9_]+)\}""").replace(template) { m -> vars[m.groupValues[1]] ?: "default" }
    }
}
