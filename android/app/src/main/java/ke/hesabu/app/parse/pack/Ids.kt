package ke.hesabu.app.parse.pack

/** Deterministic RFC 4122-shaped UUIDs from a seed, identical to the TypeScript engine's deterministicUuid. */
object Ids {
    fun deterministicUuid(seed: String): String {
        val hex = InboundMessage.sha256(seed).substring(0, 32).toCharArray()
        hex[12] = '4'
        hex[16] = "89ab"[Character.digit(hex[16], 16) % 4]
        val h = String(hex)
        return "${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}"
    }

    fun transactionId(packId: String, familyId: String, rawHash: String) = deterministicUuid("$packId|$familyId|$rawHash")

    fun transferPairId(outId: String, inId: String) = deterministicUuid("transfer|$outId|$inId")
}
