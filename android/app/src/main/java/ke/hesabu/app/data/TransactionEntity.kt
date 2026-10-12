package ke.hesabu.app.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One parsed money message. Minimal day-one shape; contracts/transaction.schema.json is the
 * authoritative schema and this entity must be reconciled with it before the first migration.
 */
@Entity(
    tableName = "transactions",
    indices = [Index(value = ["raw_hash"], unique = true), Index(value = ["occurred_at"])],
)
data class TransactionEntity(
    /** Stable id (e.g. provider receipt number when present, otherwise a UUID). */
    @PrimaryKey val id: String,
    /** Provider pack id, e.g. "mpesa", "airtel-money", "kcb". */
    val provider: String,
    /** "in", "out", "transfer" or "fee". Transfers are not spending; fees are first-class. */
    val direction: String,
    /** Amount in minor units (cents). Never a float. */
    @ColumnInfo(name = "amount_cents") val amountCents: Long,
    /** ISO 4217; KES unless a message says otherwise. */
    val currency: String = "KES",
    /** Merchant, person or account the money went to / came from. */
    val counterparty: String?,
    /** Category slug from the taxonomy; null until categorised. */
    val category: String? = null,
    /** Epoch millis of the transaction as stated in the message (Africa/Nairobi when parsed). */
    @ColumnInfo(name = "occurred_at") val occurredAt: Long,
    /** SHA-256 of the normalised raw message, for dedupe. The raw text itself is never stored here. */
    @ColumnInfo(name = "raw_hash") val rawHash: String,
)
