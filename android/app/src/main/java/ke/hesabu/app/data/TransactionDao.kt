package ke.hesabu.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionDao {

    @Query("SELECT * FROM transactions ORDER BY occurred_at DESC")
    fun observeAll(): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE occurred_at BETWEEN :fromMillis AND :toMillis ORDER BY occurred_at DESC")
    suspend fun between(fromMillis: Long, toMillis: Long): List<TransactionEntity>

    /** Ignore duplicates: the unique index on raw_hash makes re-ingesting the same message a no-op. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(items: List<TransactionEntity>): List<Long>

    @Query("SELECT COUNT(*) FROM transactions")
    suspend fun count(): Int
}
