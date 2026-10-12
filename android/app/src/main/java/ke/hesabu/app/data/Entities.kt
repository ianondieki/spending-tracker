package ke.hesabu.app.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import ke.hesabu.app.parse.pack.PostProcessor

/*
 * The on-device ledger. Columns follow contracts/transaction.schema.json; money is integer KES cents; times are
 * epoch milliseconds (converted to ISO 8601 +03:00 on the wire). Raw message bodies never appear here except in
 * unknown_messages, where the body is encrypted a second time with a Keystore key on top of SQLCipher.
 */

@Entity(
    tableName = "transactions",
    indices = [
        Index(value = ["raw_hash"], unique = true),
        Index(value = ["provider", "external_ref"]),
        Index(value = ["occurred_at"]),
        Index(value = ["account_ref", "occurred_at"]),
        Index(value = ["category_id"]),
        Index(value = ["synced_at"]),
    ],
)
data class TransactionEntity(
    @PrimaryKey override val id: String,
    @ColumnInfo(name = "account_ref") override val accountRef: String,
    override val provider: String,
    @ColumnInfo(name = "external_ref") override val externalRef: String?,
    override val type: String,
    override val direction: String,
    @ColumnInfo(name = "amount_cents") override val amountCents: Long,
    @ColumnInfo(name = "fee_cents") override val feeCents: Long,
    @ColumnInfo(name = "balance_after_cents") override val balanceAfterCents: Long?,
    @ColumnInfo(name = "occurred_at") override val occurredAtMillis: Long,
    @ColumnInfo(name = "received_at") val receivedAtMillis: Long,
    @ColumnInfo(name = "counterparty_name") val counterpartyName: String?,
    @ColumnInfo(name = "counterparty_kind") override val counterpartyKind: String,
    @ColumnInfo(name = "counterparty_ref_masked") val counterpartyRefMasked: String?,
    val paybill: String?,
    val till: String?,
    @ColumnInfo(name = "counterparty_account_ref") val counterpartyAccountRef: String?,
    @ColumnInfo(name = "category_id") val categoryId: String?,
    /** rule | merchant | provider_default | model | user | none */
    @ColumnInfo(name = "category_source") val categorySource: String,
    @ColumnInfo(name = "category_confidence") val categoryConfidence: Double,
    @ColumnInfo(name = "is_transfer") val isTransfer: Boolean,
    @ColumnInfo(name = "is_transfer_hint") override val isTransferHint: Boolean,
    @ColumnInfo(name = "transfer_pair_id") val transferPairId: String?,
    @ColumnInfo(name = "parse_confidence") val parseConfidence: Double,
    /** sms | notification | import | manual | share */
    val source: String,
    @ColumnInfo(name = "raw_hash") override val rawHash: String,
    @ColumnInfo(name = "pack_id") val packId: String,
    @ColumnInfo(name = "pack_version") val packVersion: String,
    @ColumnInfo(name = "family_id") override val familyId: String,
    @ColumnInfo(name = "user_edited") val userEdited: Boolean,
    val note: String?,
    /** JSON array of strings. */
    val tags: String = "[]",
    @ColumnInfo(name = "updated_at") val updatedAtMillis: Long,
    /** Set when the row (at this updated_at) has been accepted by the server; null means queued. */
    @ColumnInfo(name = "synced_at") val syncedAtMillis: Long? = null,
    /** Advisory: the balance chain did not add up before this row (possible missed message). */
    @ColumnInfo(name = "balance_break") val balanceBreak: Boolean = false,
) : PostProcessor.LedgerLike

@Entity(tableName = "accounts")
data class AccountEntity(
    @PrimaryKey @ColumnInfo(name = "account_ref") val accountRef: String,
    val provider: String,
    val institution: String?,
    val label: String,
    val mask: String?,
    @ColumnInfo(name = "last_balance_cents") val lastBalanceCents: Long?,
    @ColumnInfo(name = "last_balance_at") val lastBalanceAtMillis: Long?,
    @ColumnInfo(name = "last_message_at") val lastMessageAtMillis: Long?,
    @ColumnInfo(name = "updated_at") val updatedAtMillis: Long,
)

/** A message from a known money sender that no family parsed. The body is encrypted with [BodyCrypto]. */
@Entity(tableName = "unknown_messages", indices = [Index(value = ["raw_hash"], unique = true), Index(value = ["status"])])
data class UnknownMessageEntity(
    @PrimaryKey val id: String,
    val sender: String,
    @ColumnInfo(name = "body_encrypted", typeAffinity = ColumnInfo.BLOB) val bodyEncrypted: ByteArray,
    @ColumnInfo(name = "received_at") val receivedAtMillis: Long,
    @ColumnInfo(name = "raw_hash") val rawHash: String,
    /** pending | labelled | dismissed */
    val status: String = "pending",
    @ColumnInfo(name = "pack_ids") val packIds: String,
    val source: String,
    /** When the user labelled it: the transaction id created from the label. */
    @ColumnInfo(name = "labelled_transaction_id") val labelledTransactionId: String? = null,
    @ColumnInfo(name = "updated_at") val updatedAtMillis: Long,
)

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "parent_id") val parentId: String?,
    @ColumnInfo(name = "name_en") val nameEn: String,
    @ColumnInfo(name = "name_sw") val nameSw: String,
    /** spend | income | transfer | fee | cash | other */
    val kind: String,
    @ColumnInfo(name = "sort_order") val sortOrder: Int,
)

/** A seeded merchant/paybill/till → category mapping from the taxonomy package. */
@Entity(tableName = "merchant_seeds", indices = [Index(value = ["match_kind", "match_value"])])
data class MerchantSeedEntity(
    @PrimaryKey val id: String,
    /** name | paybill | till | type */
    @ColumnInfo(name = "match_kind") val matchKind: String,
    /** Lower-cased, whitespace-collapsed. */
    @ColumnInfo(name = "match_value") val matchValue: String,
    @ColumnInfo(name = "display_name") val displayName: String?,
    @ColumnInfo(name = "category_id") val categoryId: String,
    val confidence: Double,
)

/** "Teach Hesabu": a rule the user created, which always wins. */
@Entity(tableName = "user_rules", indices = [Index(value = ["match_kind", "match_value"])])
data class UserRuleEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "match_kind") val matchKind: String,
    @ColumnInfo(name = "match_value") val matchValue: String,
    @ColumnInfo(name = "category_id") val categoryId: String,
    @ColumnInfo(name = "mark_transfer") val markTransfer: Boolean = false,
    @ColumnInfo(name = "created_at") val createdAtMillis: Long,
)

/** Rows waiting to go to POST /v1/sync. Only ids: the payload is built from the ledger at send time. */
@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey @ColumnInfo(name = "transaction_id") val transactionId: String,
    @ColumnInfo(name = "enqueued_at") val enqueuedAtMillis: Long,
    val attempts: Int = 0,
    @ColumnInfo(name = "last_error") val lastError: String? = null,
)
