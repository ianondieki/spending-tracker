package ke.hesabu.app.parse.pack

/**
 * Executes provider packs exactly as PROVIDER-PACKS.md describes, in the same order as the TypeScript engine:
 * sender filter → family selection (prefilter, then pattern, first match wins) → fields → normalisers → outputs.
 *
 * [deviceVars] fills `account_ref_template` placeholders such as `{sim_msisdn_masked}`; they come from the device,
 * never from the message. A missing variable becomes `default` so the account key is still stable.
 */
class PackEngine(
    packs: List<ProviderPack>,
    private val deviceVars: Map<String, String> = emptyMap(),
) {
    private val compiled: List<CompiledPack> = packs.map { CompiledPack(it) }
    private val bySender: Map<String, List<CompiledPack>> =
        compiled.flatMap { cp -> cp.pack.senderKeys.map { it to cp } }.groupBy({ it.first }, { it.second })

    val packs: List<ProviderPack> get() = compiled.map { it.pack }

    /** Every sender id any pack claims, lower-cased: the inbox backfill reads only these. */
    val knownSenders: Set<String> get() = bySender.keys

    fun isKnownSender(sender: String): Boolean = senderKey(sender) in bySender

    /** The account key a message from [sender] would be filed under (first pack claiming the sender), or null. */
    fun accountRefFor(sender: String): String? = bySender[senderKey(sender)]?.firstOrNull()?.let { cp ->
        Regex("""\{([a-z0-9_]+)\}""").replace(cp.pack.accountRefTemplate) { m -> deviceVars[m.groupValues[1]] ?: "default" }
    }

    fun providerFor(sender: String): String? = bySender[senderKey(sender)]?.firstOrNull()?.pack?.provider

    fun parse(message: InboundMessage): ParseResult {
        val candidates = bySender[senderKey(message.sender)] ?: return ParseResult.NotMoneySender
        for (cp in candidates) {
            val result = cp.evaluate(message, deviceVars)
            if (result != null) return result
        }
        return ParseResult.Unknown(candidates.map { it.pack.packId })
    }

    /** Parses a whole inbox and returns the results in the same order. */
    fun parseAll(messages: List<InboundMessage>): List<ParseResult> = messages.map(::parse)

    private fun senderKey(sender: String) = sender.trim().lowercase()

    private class CompiledFamily(val family: Family, val regex: PortableRegex.Compiled) {
        val allOf = family.prefilter?.allOf?.map { it.lowercase() } ?: emptyList()
        val noneOf = family.prefilter?.noneOf?.map { it.lowercase() } ?: emptyList()

        fun prefilterPasses(lowerBody: String): Boolean =
            allOf.all { lowerBody.contains(it) } && noneOf.none { lowerBody.contains(it) }
    }

    private class CompiledPack(val pack: ProviderPack) {
        val families: List<CompiledFamily> = pack.families.map { f ->
            CompiledFamily(f, PortableRegex.compile(f.pattern)).also { cf ->
                val missing = f.fields.keys.filter { it !in cf.regex.groupNames }
                require(missing.isEmpty()) { "pack ${pack.packId} family ${f.familyId}: fields ${missing} are not groups in the pattern" }
            }
        }

        fun evaluate(message: InboundMessage, deviceVars: Map<String, String>): ParseResult? {
            val lowerBody = message.body.lowercase()
            for (cf in families) {
                if (!cf.prefilterPasses(lowerBody)) continue
                val groups = cf.regex.find(message.body) ?: continue
                if (cf.family.ignore) return ParseResult.Ignored(pack.packId, pack.version, cf.family.familyId)
                val tx = extract(cf.family, groups, message, deviceVars) ?: continue
                return ParseResult.Parsed(tx)
            }
            return null
        }

        private fun extract(
            family: Family,
            groups: Map<String, String?>,
            message: InboundMessage,
            deviceVars: Map<String, String>,
        ): ParsedTransaction? {
            val values = HashMap<String, Any>()
            for ((group, mapping) in family.fields) {
                val raw = groups[group]
                if (raw == null) {
                    if (mapping.optional) continue
                    return null // required group missing: family fails, evaluation continues with the next family
                }
                val v: Any? = when (mapping.normalise) {
                    "amount" -> Normalisers.amount(raw, pack.amountPrefixes)
                    "datetime" -> Normalisers.datetime(raw, pack.datetimeFormats)
                    "text" -> Normalisers.text(raw).ifEmpty { null }
                    "phone" -> Normalisers.phone(raw)
                    "code" -> Normalisers.code(raw)
                    "digits" -> Normalisers.digits(raw)
                    else -> null
                }
                if (v == null) {
                    if (mapping.optional) continue
                    return null // a required value that cannot be normalised exactly fails the family
                }
                // Two groups may feed one field (alternations); the first non-null wins.
                values.putIfAbsent(mapping.to, if (mapping.to == "account_ref") Normalisers.accountRef(raw) else v)
            }
            val amount = values["amount"] as? Long ?: return null
            val fee = values["fee"] as? Long ?: family.defaults?.feeCents ?: 0L
            val occurredAt = values["occurred_at"] as? String ?: Normalisers.epochMillisToIso(message.receivedAtMillis)
            return ParsedTransaction(
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
                feeCents = fee,
                balanceAfterCents = values["balance_after"] as? Long,
                occurredAt = occurredAt,
                externalRef = values["external_ref"] as? String,
                counterpartyName = (values["counterparty_name"] as? String) ?: family.defaults?.counterpartyName,
                counterpartyRef = values["counterparty_ref"] as? String,
                paybill = values["paybill"] as? String,
                till = values["till"] as? String,
                counterpartyAccountRef = values["account_ref"] as? String,
                note = values["note"] as? String,
                parseConfidence = family.confidence,
                defaultCategoryId = family.defaults?.categoryId,
                rawHash = message.rawHash,
                receivedAtMillis = message.receivedAtMillis,
                source = message.source,
            )
        }

        private fun fillTemplate(template: String, vars: Map<String, String>): String =
            Regex("""\{([a-z0-9_]+)\}""").replace(template) { m -> vars[m.groupValues[1]] ?: "default" }
    }
}
