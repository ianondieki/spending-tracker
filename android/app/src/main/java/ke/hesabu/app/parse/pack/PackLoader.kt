package ke.hesabu.app.parse.pack

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Loads packs from the APK: `assets/provider-packs/` (copied from contracts/provider-packs at build time) plus
 * `assets/provider-packs-builtin/` (this module's own fallback packs). A built-in pack is dropped when a contract
 * pack claims any of the same sender ids, so Lane D's packs always win once they are merged.
 *
 * A pack that fails to parse or compile is skipped with a one-line log naming the file, never its contents.
 */
object PackLoader {

    const val CONTRACT_DIR = "provider-packs"
    const val BUILTIN_DIR = "provider-packs-builtin"
    private const val TAG = "PackLoader"

    fun fromJson(json: String): ProviderPack = PackJson.decodeFromString(ProviderPack.serializer(), json)

    fun fromAssets(context: Context): List<ProviderPack> {
        val assets = context.assets
        fun load(dir: String): List<ProviderPack> =
            (assets.list(dir)?.toList() ?: emptyList()).filter { it.endsWith(".json") }.sorted().mapNotNull { name ->
                runCatching { assets.open("$dir/$name").bufferedReader().use { fromJson(it.readText()) } }
                    .onFailure { Log.w(TAG, "Skipping pack $dir/$name: ${it.javaClass.simpleName}") }
                    .getOrNull()
            }
        return merge(contract = load(CONTRACT_DIR), builtin = load(BUILTIN_DIR))
    }

    /** For JVM tests and tools: every `*.json` in the given directories, contract directories first. */
    fun fromDirectories(contract: List<File>, builtin: List<File>): List<ProviderPack> {
        fun load(dirs: List<File>) = dirs.flatMap { d -> d.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name } ?: emptyList() }
            .map { fromJson(it.readText()) }
        return merge(load(contract), load(builtin))
    }

    fun merge(contract: List<ProviderPack>, builtin: List<ProviderPack>): List<ProviderPack> {
        val claimed = contract.flatMap { it.senderKeys }.toSet()
        val ids = contract.map { it.packId }.toSet()
        return contract + builtin.filter { b -> b.packId !in ids && b.senderKeys.none { it in claimed } }
    }

    /** Validates a pack by compiling every family; throws with the family id on the first problem. */
    fun validate(pack: ProviderPack) {
        PackEngine(listOf(pack))
    }
}
