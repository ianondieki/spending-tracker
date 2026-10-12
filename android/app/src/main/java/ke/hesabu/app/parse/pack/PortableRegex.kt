package ke.hesabu.app.parse.pack

import java.util.regex.Pattern

/**
 * The portable regex subset from PROVIDER-PACKS.md: what java.util.regex and JavaScript RegExp evaluate
 * identically. Rejects the constructs the contract forbids (lookaround, backreferences, Unicode properties,
 * possessive quantifiers, inline flags, word boundaries) and group names outside `[a-z][a-z0-9_]*`.
 */
object PortableRegex {

    private val groupName = Regex("""\(\?<([^>=!][^>]*)>""")
    private val validName = Regex("""^[a-z][a-z0-9_]*$""")

    private val forbidden = listOf(
        Regex("""\(\?<[=!]""") to "lookbehind",
        Regex("""\(\?[=!]""") to "lookahead",
        Regex("""\(\?[a-zA-Z]+[-a-zA-Z]*[):]""") to "inline flags",
        Regex("""\\[pP]\{""") to "Unicode property",
        Regex("""\\[1-9]""") to "backreference",
        Regex("""\\k<""") to "named backreference",
        Regex("""\\[bB]""") to "word boundary",
        Regex("""[*+?}]\+""") to "possessive quantifier",
    )

    class PortableRegexException(message: String) : IllegalArgumentException(message)

    /** Compiles case-insensitively, as both engines must. Throws [PortableRegexException] on a forbidden construct. */
    fun compile(pattern: String): Compiled {
        val stripped = stripClassesAndEscapes(pattern)
        for ((rx, what) in forbidden) {
            if (rx.containsMatchIn(stripped)) throw PortableRegexException("pattern uses $what, which is not portable: $pattern")
        }
        val names = groupName.findAll(pattern).map { it.groupValues[1] }.toList()
        names.forEach {
            if (!validName.matches(it)) throw PortableRegexException("group name '$it' must match [a-z][a-z0-9_]*")
        }
        val compiled = try {
            Pattern.compile(pattern, Pattern.CASE_INSENSITIVE)
        } catch (e: java.util.regex.PatternSyntaxException) {
            throw PortableRegexException("invalid pattern: ${e.description}")
        }
        return Compiled(compiled, names)
    }

    /** Removes escaped characters and character classes so the forbidden checks only see structural syntax. */
    private fun stripClassesAndEscapes(p: String): String {
        val sb = StringBuilder()
        var i = 0
        var inClass = false
        while (i < p.length) {
            val c = p[i]
            when {
                c == '\\' && i + 1 < p.length -> {
                    val n = p[i + 1]
                    // Keep the escapes the checks care about; drop the rest (they are literal characters).
                    if (n in "pPbBk" || n.isDigit()) sb.append('\\').append(n) else sb.append('_')
                    i += 2
                    continue
                }
                c == '[' && !inClass -> inClass = true
                c == ']' && inClass -> inClass = false
                inClass -> { i++; continue }
            }
            if (!inClass) sb.append(c)
            i++
        }
        return sb.toString()
    }

    class Compiled(val pattern: Pattern, val groupNames: List<String>) {
        /** Search semantics (JavaScript `test`/`exec`), not whole-string match. */
        fun find(body: String): Map<String, String?>? {
            val m = pattern.matcher(body)
            if (!m.find()) return null
            return groupNames.associateWith { name -> m.group(name) }
        }
    }
}
