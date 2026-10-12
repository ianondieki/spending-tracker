package ke.hesabu.app.data

import android.content.Context
import android.util.Log
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Loads the category taxonomy and merchant seeds. `assets/taxonomy/` (copied from packages/taxonomy/dist at build
 * time, owned by Lane D) wins; `assets/taxonomy-builtin/` is this module's fallback. The reader is tolerant about
 * key names (`name` as a string or `{en, sw}`, `parent` or `parent_id`, `pattern`/`name`/`value`) because the
 * taxonomy package's output format is not a frozen contract.
 */
object Taxonomy {

    const val DIR = "taxonomy"
    const val BUILTIN_DIR = "taxonomy-builtin"
    private const val TAG = "Taxonomy"

    data class Loaded(val version: String, val categories: List<CategoryEntity>, val seeds: List<MerchantSeedEntity>, val fromContracts: Boolean)

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun fromAssets(context: Context): Loaded? {
        val assets = context.assets
        fun read(dir: String): List<String> =
            (assets.list(dir)?.toList() ?: emptyList()).filter { it.endsWith(".json") }.sorted().mapNotNull { name ->
                runCatching { assets.open("$dir/$name").bufferedReader().use { it.readText() } }
                    .onFailure { Log.w(TAG, "Cannot read $dir/$name") }.getOrNull()
            }
        val contract = read(DIR)
        if (contract.isNotEmpty()) parseAll(contract, fromContracts = true)?.let { if (it.categories.isNotEmpty()) return it }
        return parseAll(read(BUILTIN_DIR), fromContracts = false)
    }

    fun parseAll(documents: List<String>, fromContracts: Boolean): Loaded? {
        val cats = ArrayList<CategoryEntity>()
        val seeds = ArrayList<MerchantSeedEntity>()
        var version = "0"
        for (doc in documents) {
            val root = runCatching { json.parseToJsonElement(doc) }.getOrNull() ?: continue
            val parsed = parse(root) ?: continue
            cats += parsed.categories
            seeds += parsed.seeds
            if (parsed.version != "0") version = parsed.version
        }
        if (cats.isEmpty() && seeds.isEmpty()) return null
        return Loaded(version, cats.distinctBy { it.id }, seeds.distinctBy { it.id }, fromContracts)
    }

    fun parse(root: JsonElement): Loaded? {
        val obj = root as? JsonObject ?: run {
            // A bare array of categories.
            val arr = root as? JsonArray ?: return null
            return Loaded("0", arr.mapIndexedNotNull { i, e -> category(e, i) }, emptyList(), false)
        }
        val version = obj.str("version") ?: "0"
        val categories = (obj["categories"] as? JsonArray)?.mapIndexedNotNull { i, e -> category(e, i) } ?: emptyList()
        val merchantKey = listOf("merchants", "merchant_seeds", "seeds", "rules").firstOrNull { obj[it] is JsonArray }
        val seeds = merchantKey?.let { obj[it]!!.jsonArray.mapIndexedNotNull { i, e -> seed(e, i) } } ?: emptyList()
        return Loaded(version, categories, seeds, false)
    }

    private fun category(e: JsonElement, index: Int): CategoryEntity? {
        val o = e as? JsonObject ?: return null
        val id = o.str("id") ?: o.str("category_id") ?: return null
        val (en, sw) = names(o)
        return CategoryEntity(
            id = id,
            parentId = o.str("parent_id") ?: o.str("parent"),
            nameEn = en ?: id.replace('_', ' ').replaceFirstChar { it.uppercase() },
            nameSw = sw ?: en ?: id,
            kind = o.str("kind") ?: o.str("type") ?: "spend",
            sortOrder = o["sort_order"]?.jsonPrimitive?.intOrNull ?: o["sort"]?.jsonPrimitive?.intOrNull ?: index,
        )
    }

    private fun names(o: JsonObject): Pair<String?, String?> {
        val n = o["name"]
        return when (n) {
            is JsonPrimitive -> n.content to o.str("name_sw")
            is JsonObject -> n.str("en") to n.str("sw")
            else -> o.str("name_en") to o.str("name_sw")
        }
    }

    private fun seed(e: JsonElement, index: Int): MerchantSeedEntity? {
        val o = e as? JsonObject ?: return null
        val category = o.str("category_id") ?: o.str("category") ?: return null
        val kind = (o.str("match") ?: o.str("match_kind") ?: o.str("field") ?: if (o["paybill"] != null) "paybill" else if (o["till"] != null) "till" else "name").lowercase()
        val value = o.str("value") ?: o.str("pattern") ?: o.str("paybill") ?: o.str("till") ?: o.str("name") ?: o.str("merchant") ?: return null
        val norm = Categoriser.normalise(value, kind)
        return MerchantSeedEntity(
            id = o.str("id") ?: "$kind:$norm",
            matchKind = kind,
            matchValue = norm,
            displayName = o.str("display_name") ?: o.str("display") ?: o.str("label"),
            categoryId = category,
            confidence = o["confidence"]?.jsonPrimitive?.doubleOrNull ?: 0.9,
        )
    }

    private fun JsonObject.str(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString || it.content != "null" }?.content
}
