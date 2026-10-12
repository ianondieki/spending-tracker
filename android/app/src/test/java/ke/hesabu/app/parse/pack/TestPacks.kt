package ke.hesabu.app.parse.pack

import java.io.File

/** Locates pack directories for JVM tests: the built-in assets in this module and the contracts from the repo. */
object TestPacks {
    /** Gradle runs unit tests with the module directory as the working directory. */
    val moduleDir: File = File(System.getProperty("user.dir"))
    val builtinDir: File = moduleDir.resolve("src/main/assets/provider-packs-builtin")
    val contractsPacksDir: File? = System.getProperty("hesabu.contractsDir")?.let { File(it, "provider-packs") }?.takeIf { it.isDirectory }

    fun allPacks(): List<ProviderPack> =
        PackLoader.fromDirectories(contract = listOfNotNull(contractsPacksDir), builtin = listOf(builtinDir))

    fun builtinPacks(): List<ProviderPack> = PackLoader.fromDirectories(contract = emptyList(), builtin = listOf(builtinDir))

    /** A tiny pack used by the engine tests; exercises every rule in PROVIDER-PACKS.md §1 to §7. */
    val inlinePackJson = """
    {
      "pack_id": "test_pack", "version": "1.2.3", "provider": "mpesa", "institution": "Test",
      "sender_ids": [" TESTPAY ", "TPAY"], "account_ref_template": "mpesa:{sim_msisdn_masked}", "currency": "KES",
      "datetime_formats": ["d/M/yy 'at' h:mm a", "yyyy-MM-dd HH:mm"],
      "amount_prefixes": ["Kshs", "Ksh.", "Ksh", "KES"],
      "families": [
        {
          "family_id": "balance", "description": "ignore", "type": "BALANCE_QUERY", "direction": "none", "counterparty_kind": "self",
          "ignore": true, "prefilter": {"all_of": ["balance was"]}, "pattern": "balance was (?<balance>Ksh[\\d,]+\\.\\d{2})",
          "fields": {"balance": {"to": "balance_after", "normalise": "amount"}},
          "examples": [{"body": "X Confirmed. Your balance was Ksh10.00", "verified": false, "expect": {"amount_cents": 0}}]
        },
        {
          "family_id": "pay", "description": "pay with fee", "type": "PAYBILL", "direction": "out", "counterparty_kind": "paybill",
          "prefilter": {"all_of": ["sent to"], "none_of": ["reversed"]},
          "pattern": "^(?<ref>[A-Z0-9]{10}) Confirmed\\. (?<amount>Ksh[\\d,]+\\.\\d{2}) sent to (?<name>.+?) for account (?<acct>\\S+) on (?<dt>\\d{1,2}/\\d{1,2}/\\d{2} at \\d{1,2}:\\d{2} [AP]M)\\. Balance (?<balance>Ksh[\\d,]+\\.\\d{2})\\.(?: Cost (?<fee>Ksh[\\d,]+\\.\\d{2})\\.)?",
          "fields": {
            "ref": {"to": "external_ref", "normalise": "code"},
            "amount": {"to": "amount", "normalise": "amount"},
            "name": {"to": "counterparty_name", "normalise": "text"},
            "acct": {"to": "account_ref", "normalise": "text"},
            "dt": {"to": "occurred_at", "normalise": "datetime"},
            "balance": {"to": "balance_after", "normalise": "amount"},
            "fee": {"to": "fee", "normalise": "amount", "optional": true}
          },
          "defaults": {"fee_cents": 500, "category_id": "utilities"},
          "confidence": 0.9,
          "examples": [{"body": "ABC1234567 Confirmed. Ksh1,200.00 sent to KPLC   PREPAID for account 0712345678 on 12/10/26 at 2:45 PM. Balance Ksh300.00. Cost Ksh23.00.", "verified": false,
                        "expect": {"external_ref": "ABC1234567", "amount_cents": 120000, "fee_cents": 2300, "balance_after_cents": 30000, "occurred_at": "2026-10-12T14:45:00+03:00", "counterparty_name": "KPLC PREPAID"}}]
        },
        {
          "family_id": "send", "description": "send to person", "type": "SEND_MONEY", "direction": "out", "counterparty_kind": "person",
          "pattern": "^(?<ref>[A-Z0-9]{10}) Confirmed\\. (?<amount>Ksh[\\d,]+\\.\\d{2}) sent to (?<name>.+?) (?<phone>\\+?254\\d{9}|0\\d{9}) on (?<dt>\\d{1,2}/\\d{1,2}/\\d{2} at \\d{1,2}:\\d{2} [AP]M)",
          "fields": {
            "ref": {"to": "external_ref", "normalise": "code"},
            "amount": {"to": "amount", "normalise": "amount"},
            "name": {"to": "counterparty_name", "normalise": "text"},
            "phone": {"to": "counterparty_ref", "normalise": "phone"},
            "dt": {"to": "occurred_at", "normalise": "datetime"}
          },
          "examples": [{"body": "ABC1234568 Confirmed. Ksh50.00 sent to Jane W +254712345678 on 1/1/26 at 9:05 AM", "verified": false,
                        "expect": {"external_ref": "ABC1234568", "amount_cents": 5000, "fee_cents": 0, "balance_after_cents": null, "occurred_at": "2026-01-01T09:05:00+03:00", "counterparty_name": "Jane W"}}]
        },
        {
          "family_id": "bank_in", "description": "from bank, no date", "type": "BANK_TO_MPESA", "direction": "in", "counterparty_kind": "bank",
          "is_transfer_hint": true,
          "pattern": "received (?<amount>KES ?[\\d,]+(?:\\.\\d{1,2})?) from your bank",
          "fields": {"amount": {"to": "amount", "normalise": "amount"}},
          "examples": [{"body": "You have received KES 50 from your bank", "verified": false, "expect": {"amount_cents": 5000}}]
        }
      ]
    }
    """.trimIndent()

    val inlinePack: ProviderPack by lazy { PackLoader.fromJson(inlinePackJson) }
}
