package ke.hesabu.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/** A category total for a period (drill-down source for the Home tally and the donut). */
data class CategoryTotal(@androidx.room.ColumnInfo(name = "category_id") val categoryId: String?, @androidx.room.ColumnInfo(name = "cents") val cents: Long, @androidx.room.ColumnInfo(name = "n") val count: Int)

/** A per-day total (the weekly tally and the daily bars). */
data class DayTotal(@androidx.room.ColumnInfo(name = "day") val day: String, @androidx.room.ColumnInfo(name = "cents") val cents: Long)

@Dao
interface TransactionDao {

    @Query("SELECT * FROM transactions ORDER BY occurred_at DESC, id")
    fun observeAll(): Flow<List<TransactionEntity>>

    @Query(
        """SELECT * FROM transactions
           WHERE (:accountRef IS NULL OR account_ref = :accountRef)
             AND (:categoryId IS NULL OR category_id = :categoryId)
             AND (:type IS NULL OR type = :type)
             AND (:query = '' OR counterparty_name LIKE '%' || :query || '%' OR note LIKE '%' || :query || '%' OR external_ref LIKE '%' || :query || '%')
             AND occurred_at >= :fromMillis AND occurred_at < :toMillis
           ORDER BY occurred_at DESC, id""",
    )
    fun observeFiltered(accountRef: String?, categoryId: String?, type: String?, query: String, fromMillis: Long, toMillis: Long): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE occurred_at >= :fromMillis AND occurred_at < :toMillis ORDER BY occurred_at")
    suspend fun between(fromMillis: Long, toMillis: Long): List<TransactionEntity>

    @Query("SELECT * FROM transactions WHERE occurred_at >= :fromMillis AND occurred_at < :toMillis ORDER BY occurred_at")
    fun observeBetween(fromMillis: Long, toMillis: Long): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE id = :id")
    suspend fun byId(id: String): TransactionEntity?

    @Query("SELECT * FROM transactions WHERE id = :id")
    fun observeById(id: String): Flow<TransactionEntity?>

    @Query("SELECT * FROM transactions WHERE account_ref = :accountRef AND occurred_at >= :fromMillis ORDER BY occurred_at, id")
    suspend fun forAccountSince(accountRef: String, fromMillis: Long): List<TransactionEntity>

    @Query("SELECT raw_hash FROM transactions WHERE raw_hash IN (:hashes)")
    suspend fun existingHashes(hashes: List<String>): List<String>

    @Query("SELECT external_ref FROM transactions WHERE provider = :provider AND external_ref IN (:refs)")
    suspend fun existingExternalRefs(provider: String, refs: List<String>): List<String>

    /** Ignore duplicates: the unique index on raw_hash makes re-ingesting the same message a no-op. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(items: List<TransactionEntity>): List<Long>

    @Update
    suspend fun update(item: TransactionEntity)

    @Update
    suspend fun updateAll(items: List<TransactionEntity>)

    @Query("SELECT COUNT(*) FROM transactions")
    suspend fun count(): Int

    @Query("SELECT COUNT(*) FROM transactions")
    fun observeCount(): Flow<Int>

    @Query(
        """SELECT category_id, SUM(amount_cents) AS cents, COUNT(*) AS n FROM transactions
           WHERE direction = 'out' AND is_transfer = 0 AND occurred_at >= :fromMillis AND occurred_at < :toMillis
           GROUP BY category_id ORDER BY cents DESC""",
    )
    fun observeSpendByCategory(fromMillis: Long, toMillis: Long): Flow<List<CategoryTotal>>

    @Query("SELECT * FROM transactions WHERE id IN (:ids)")
    suspend fun byIds(ids: List<String>): List<TransactionEntity>

    @Query("UPDATE transactions SET synced_at = :syncedAt WHERE id IN (:ids) AND updated_at <= :notAfter")
    suspend fun markSynced(ids: List<String>, syncedAt: Long, notAfter: Long)

    @Query("SELECT DISTINCT counterparty_name FROM transactions WHERE counterparty_name IS NOT NULL ORDER BY counterparty_name")
    suspend fun counterpartyNames(): List<String>

    /** Removes rows carrying a tag (demo mode off). Tags are a JSON array, so the quoted form is matched. */
    @Query("DELETE FROM transactions WHERE tags LIKE '%' || :quotedTag || '%'")
    suspend fun deleteByTag(quotedTag: String): Int

    @Query("SELECT id FROM transactions WHERE tags LIKE '%' || :quotedTag || '%'")
    suspend fun idsByTag(quotedTag: String): List<String>
}

@Dao
interface AccountDao {
    @Query("SELECT * FROM accounts ORDER BY label")
    fun observeAll(): Flow<List<AccountEntity>>

    @Query("SELECT * FROM accounts ORDER BY label")
    suspend fun all(): List<AccountEntity>

    @Query("SELECT * FROM accounts WHERE account_ref = :ref")
    suspend fun byRef(ref: String): AccountEntity?

    @Upsert
    suspend fun upsert(account: AccountEntity)
}

@Dao
interface UnknownMessageDao {
    @Query("SELECT * FROM unknown_messages WHERE status = 'pending' ORDER BY received_at DESC")
    fun observePending(): Flow<List<UnknownMessageEntity>>

    @Query("SELECT COUNT(*) FROM unknown_messages WHERE status = 'pending'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM unknown_messages WHERE status = 'pending'")
    suspend fun pendingCount(): Int

    @Query("SELECT * FROM unknown_messages WHERE id = :id")
    suspend fun byId(id: String): UnknownMessageEntity?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(items: List<UnknownMessageEntity>): List<Long>

    @Update
    suspend fun update(item: UnknownMessageEntity)

    @Query("SELECT raw_hash FROM unknown_messages WHERE raw_hash IN (:hashes)")
    suspend fun existingHashes(hashes: List<String>): List<String>

    @Query("SELECT sender, COUNT(*) AS n FROM unknown_messages WHERE status = 'pending' GROUP BY sender")
    suspend fun pendingBySender(): List<SenderCount>

    @Query("DELETE FROM unknown_messages WHERE source = :source")
    suspend fun deleteBySource(source: String): Int
}

data class SenderCount(val sender: String, val n: Int)

@Dao
interface CategoryDao {
    @Query("SELECT * FROM categories ORDER BY sort_order, name_en")
    fun observeAll(): Flow<List<CategoryEntity>>

    @Query("SELECT * FROM categories ORDER BY sort_order, name_en")
    suspend fun all(): List<CategoryEntity>

    @Query("SELECT COUNT(*) FROM categories")
    suspend fun count(): Int

    @Upsert
    suspend fun upsertAll(items: List<CategoryEntity>)

    @Query("DELETE FROM categories")
    suspend fun clear()
}

@Dao
interface MerchantSeedDao {
    @Query("SELECT * FROM merchant_seeds")
    suspend fun all(): List<MerchantSeedEntity>

    @Query("SELECT COUNT(*) FROM merchant_seeds")
    suspend fun count(): Int

    @Upsert
    suspend fun upsertAll(items: List<MerchantSeedEntity>)

    @Query("DELETE FROM merchant_seeds")
    suspend fun clear()
}

@Dao
interface UserRuleDao {
    @Query("SELECT * FROM user_rules ORDER BY created_at DESC")
    fun observeAll(): Flow<List<UserRuleEntity>>

    @Query("SELECT * FROM user_rules")
    suspend fun all(): List<UserRuleEntity>

    @Upsert
    suspend fun upsert(rule: UserRuleEntity)

    @Query("DELETE FROM user_rules WHERE id = :id")
    suspend fun delete(id: String)
}

@Dao
interface SyncQueueDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun enqueueAll(items: List<SyncQueueEntity>)

    @Upsert
    suspend fun upsert(item: SyncQueueEntity)

    @Query("SELECT * FROM sync_queue ORDER BY enqueued_at LIMIT :limit")
    suspend fun nextBatch(limit: Int): List<SyncQueueEntity>

    @Query("DELETE FROM sync_queue WHERE transaction_id IN (:ids)")
    suspend fun remove(ids: List<String>)

    @Query("UPDATE sync_queue SET attempts = attempts + 1, last_error = :error WHERE transaction_id IN (:ids)")
    suspend fun recordFailure(ids: List<String>, error: String?)

    @Query("SELECT COUNT(*) FROM sync_queue")
    fun observeCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sync_queue")
    suspend fun count(): Int

    @Transaction
    suspend fun requeue(ids: List<String>, now: Long) {
        enqueueAll(ids.map { SyncQueueEntity(it, now) })
    }
}
