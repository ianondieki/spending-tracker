package ke.hesabu.app.parse.pack

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * Runs every redacted public sample in corpus/ through the loaded packs. Lane D's packs own real coverage; this
 * test guards the built-in fallback: a known-sender sample whose `family_guess` names a built-in family must parse
 * as that family, and the list of what the fallback cannot read is printed so the gap is visible, not hidden.
 */
class CorpusCoverageTest {

    private val repo: File? = System.getProperty("hesabu.repoDir")?.let(::File)?.takeIf { it.isDirectory }
    private val json = Json { ignoreUnknownKeys = true }

    data class Sample(val sender: String, val body: String, val guess: String?)

    private fun samples(): List<Sample> {
        val dir = repo?.resolve("corpus") ?: return emptyList()
        return dir.walkTopDown().filter { it.isFile && it.name.endsWith(".jsonl") }.flatMap { f ->
            f.readLines().filter { it.isNotBlank() }.map { line ->
                val o = json.parseToJsonElement(line).jsonObject
                Sample(o["sender"]!!.jsonPrimitive.content, o["body"]!!.jsonPrimitive.content, o["family_guess"]?.jsonPrimitive?.content)
            }
        }.toList()
    }

    @Test
    fun builtinPackReadsTheEnglishMpesaFamiliesItClaims() {
        val all = samples()
        assumeTrue("corpus not available", all.isNotEmpty())
        val engine = PackEngine(TestPacks.allPacks())
        val families = engine.packs.flatMap { p -> p.families.map { it.familyId } }.toSet()
        val failures = ArrayList<String>()
        var known = 0
        var parsed = 0
        for (s in all) {
            if (!engine.isKnownSender(s.sender)) continue
            known++
            val r = engine.parse(InboundMessage(s.sender, s.body, 0))
            val ok = r is ParseResult.Parsed || r is ParseResult.Ignored
            if (ok) parsed++
            val got = when (r) { is ParseResult.Parsed -> r.transaction.familyId; is ParseResult.Ignored -> r.familyId; else -> "unknown" }
            // A corpus guess names a family or a family group ("reversal" covers reversal_credit and reversal_debit).
            fun matches(f: String, guess: String) = f == guess || f.startsWith("${guess}_")
            val expectedHere = s.guess != null && families.any { matches(it, s.guess) } && !s.body.contains("Imethibitishwa")
            if (expectedHere && !matches(got, s.guess!!)) failures.add("${s.guess} -> $got: ${s.body.take(90)}")
        }
        println("corpus: $parsed of $known known-sender samples parsed; ${failures.size} mismatches")
        failures.forEach { println("  $it") }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }
}
