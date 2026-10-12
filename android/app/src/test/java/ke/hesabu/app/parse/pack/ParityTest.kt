package ke.hesabu.app.parse.pack

import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import java.io.File

/**
 * Cross-engine parity: for every corpus file and the demo inbox, this engine's canonical dump must equal the
 * TypeScript engine's committed `corpus/expected/` files byte for byte (corpus/expected/README.md).
 */
@RunWith(Parameterized::class)
class ParityTest(private val input: File, private val expected: File, private val variables: Map<String, String>, @Suppress("unused") private val name: String) {

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{3}")
        fun targets(): List<Array<Any>> {
            val repo = System.getProperty("hesabu.repoDir")?.let(::File) ?: return emptyList()
            val corpus = repo.resolve("corpus")
            if (!corpus.isDirectory) return emptyList()
            val expectedDir = corpus.resolve("expected")
            val out = ArrayList<Array<Any>>()
            corpus.walkTopDown().filter { it.isFile && it.name.endsWith(".jsonl") && !it.path.contains("/expected/") && !it.path.contains("/demo/") }
                .sortedBy { it.path }.forEach { f ->
                    val rel = f.relativeTo(corpus).path
                    out.add(arrayOf(f, expectedDir.resolve(rel.removeSuffix(".jsonl") + ".expected.jsonl"), ParityDump.CORPUS_VARIABLES, rel))
                }
            val demo = corpus.resolve("demo/demo-inbox.jsonl")
            if (demo.isFile) out.add(arrayOf(demo, expectedDir.resolve("demo-inbox.expected.jsonl"), ParityDump.DEMO_VARIABLES, "demo/demo-inbox.jsonl"))
            return out
        }
    }

    @Test
    fun dumpMatchesTheReferenceEngine() {
        assumeTrue("no expected file for $input", expected.isFile)
        val packs = PackLoader.fromDirectories(contract = listOfNotNull(TestPacks.contractsPacksDir), builtin = emptyList())
        assumeTrue("no contract packs", packs.isNotEmpty())
        val engine = PackEngine(packs, variables)
        val actual = ParityDump.dumpFile(engine, ParityDump.readJsonl(input.readText()))
        val want = expected.readText()
        if (actual != want) {
            val a = actual.split('\n'); val w = want.split('\n')
            val i = a.indices.firstOrNull { it >= w.size || a[it] != w[it] } ?: a.size
            fail("line $i differs\n expected: ${w.getOrNull(i)}\n   actual: ${a.getOrNull(i)}")
        }
        assertEquals(want, actual)
    }
}
