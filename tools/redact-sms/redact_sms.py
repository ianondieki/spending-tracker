#!/usr/bin/env python3
"""redact_sms.py - turn an "SMS Backup & Restore" XML export into a redacted fixture corpus.

Python 3.11+, standard library only.

    python3 tools/redact-sms/redact_sms.py export.xml --out corpus/ [--sender X ...] [--all]
                                           [--dry-run] [--stats] [--list-senders]

Pipeline per message:
  1. keep only <sms> elements (MMS ignored), received messages (type="1") unless --include-sent;
  2. keep only senders on the allow-list (tools/redact-sms/senders.default.json, --sender, --all);
  3. redact the body while preserving structure so anchored regex parsers still work;
  4. write corpus/<provider>/<yyyy-mm>.jsonl, one JSON object per line, de-duplicated on the
     SHA-256 of the ORIGINAL body (the original body itself is never written).

Redaction rules (see corpus/README.md for the human-readable version):
  * e-mail addresses                      -> redacted@example.com
  * counterparty names after anchors      -> REDACTED PERSON (a phone number is adjacent in the
    ("sent to", "paid to", "received ...     clause) or REDACTED MERCHANT (otherwise); names of
    from", "cash to", "for account",         public institutions on the `public_counterparties`
    "Dear", "to", "from", agent lines)       list are kept verbatim because they define families
  * M-PESA style transaction codes        -> same-shape code, letter->letter, digit->digit,
    (8-12 upper-case alphanumerics)          deterministic per input code (optionally salted)
  * Kenyan phone numbers                  -> first 2 and last 3 digits kept, rest -> X
  * national ID numbers, JumbeID          -> REDACTED ID
  * other 6+ digit numbers (accounts,     -> all but the last 3 digits -> X; amounts, dates,
    tills, agent numbers)                    times and balances are never touched
Amount tokens (Ksh1,205.10), currency words, dates, times and the anchor words ("Confirmed",
"New M-PESA balance", "Transaction cost", ...) are never altered.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterable, Iterator

__version__ = "0.1.0"
REDACTOR_VERSION = f"redact-sms/{__version__}"
SOURCE_TAG = "sms-backup-xml"

try:  # Africa/Nairobi is UTC+3 with no DST; fall back to a fixed offset when tzdata is absent.
    from zoneinfo import ZoneInfo

    NAIROBI = ZoneInfo("Africa/Nairobi")
except Exception:  # pragma: no cover - depends on the host's tzdata
    NAIROBI = timezone(timedelta(hours=3), "EAT")

DEFAULT_SENDERS_FILE = Path(__file__).with_name("senders.default.json")

PERSON = "REDACTED PERSON"
MERCHANT = "REDACTED MERCHANT"
REDACTED_ID = "REDACTED ID"
REDACTED_EMAIL = "redacted@example.com"

# --------------------------------------------------------------------------------------------
# Sender configuration
# --------------------------------------------------------------------------------------------


def normalise_sender(sender: str) -> str:
    return re.sub(r"\s+", " ", (sender or "").strip()).casefold()


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").casefold()).strip("-")
    return slug or "unknown"


def _norm_phrase(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip()).casefold()


@dataclass
class SenderConfig:
    sender_to_provider: dict[str, str] = field(default_factory=dict)
    public_counterparties: list[str] = field(default_factory=list)
    providers: dict = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path | None = None) -> "SenderConfig":
        path = path or DEFAULT_SENDERS_FILE
        with open(path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        cfg = cls(providers=raw.get("providers", {}))
        for provider, spec in cfg.providers.items():
            for sender in spec.get("senders", []):
                cfg.sender_to_provider.setdefault(normalise_sender(sender), provider)
        cfg.public_counterparties = sorted(
            {_norm_phrase(p) for p in raw.get("public_counterparties", [])}, key=len, reverse=True
        )
        return cfg

    def add_override(self, spec: str) -> None:
        """--sender NAME or --sender NAME=provider/slug"""
        name, _, provider = spec.partition("=")
        provider = provider.strip() or f"other/{slugify(name)}"
        self.sender_to_provider[normalise_sender(name)] = provider

    def provider_for(self, sender: str) -> str | None:
        return self.sender_to_provider.get(normalise_sender(sender))

    def is_public_counterparty(self, span: str) -> bool:
        n = _norm_phrase(span)
        for prefix in self.public_counterparties:
            if n == prefix or n.startswith(prefix + " "):
                return True
        return False


# --------------------------------------------------------------------------------------------
# Redaction primitives
# --------------------------------------------------------------------------------------------

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Kenyan mobile numbers: 07xx xxx xxx, 01xx xxx xxx, 2547xx..., +2547..., with optional separators.
PHONE_RE = re.compile(
    r"(?<![\w*])(?:\+?254|0)[\s-]?[17]\d(?:[\s-]?\d){7}(?![\d*])"
)

# A number Safaricom already masked, e.g. 0791***401 (used only to decide PERSON vs MERCHANT).
MASKED_PHONE_RE = re.compile(r"(?<![\w*])(?:\+?254|0)[17]\d{1,2}\*{2,}\d{2,3}(?![\d*])")

# 8-12 upper-case alphanumerics containing at least one letter and one digit (M-PESA codes are 10).
CODE_RE = re.compile(
    r"(?<![A-Za-z0-9])(?=[A-Z0-9]{8,12}(?![A-Za-z0-9]))(?=[0-9]*[A-Z])(?=[A-Z]*[0-9])[A-Z0-9]{8,12}"
)

NATIONAL_ID_RE = re.compile(
    r"\b((?:national\s+)?(?:ID|I\.D\.?)(?:\s*(?:no|number|num)\.?)?\s*[:#]?\s*)(\d{6,9})\b",
    re.IGNORECASE,
)
JUMBE_RE = re.compile(r"(JumbeID\s*:\s*)([^\s.,;]+)")
DIGIT_RUN_RE = re.compile(r"(?<![A-Za-z0-9,.])\d{6,}(?![A-Za-z0-9,])")
CURRENCY_BEFORE_RE = re.compile(r"(?:Ksh|KES|Kshs|Tsh|USD)\.?\s*$", re.IGNORECASE)

PLACEHOLDER_OPEN = ""
PLACEHOLDER_CLOSE = ""
PLACEHOLDER_RE = re.compile(f"{PLACEHOLDER_OPEN}([a-z]+){PLACEHOLDER_CLOSE}")

NAME_TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’&/.\-]*")
STOP_LOWER = {
    "on", "for", "via", "using", "at", "to", "from", "is", "has", "have", "was", "account",
    "in", "the", "your", "my", "by", "with", "has", "been", "a", "an", "will", "please",
}
STOP_EXACT = {
    "New", "Your", "Transaction", "Till", "TILL", "Fee", "Date", "Ref", "Ref.", "Reference", "Receipt",
    "Dial", "Download", "Save", "Earn", "Get", "Separate", "To", "Thank", "Amount", "M-PESA", "MPESA",
    "Ksh", "KES", "Kshs", "Interest", "Access", "Total", "Available", "Pay", "Buy", "Use", "Confirmed",
    "Failed", "You", "Exch", "Charges", "Bal", "Balance", "Trans", "Txn", "TID", "Tarehe", "tarehe",
    "Baki", "Gharama", "Kindly", "Please", "Start", "Opt",
}
DEAR_STOP = {"customer", "valued", "client", "member", "user", "sir", "madam", "subscriber"}


def _hash_bytes(salt: str, code: str) -> bytes:
    return hashlib.sha256(f"{salt}\x1f{code}".encode("utf-8")).digest()


def remap_code(code: str, salt: str = "") -> str:
    """Deterministic, class-preserving substitution: letter->letter, digit->digit."""
    digest = _hash_bytes(salt, code)
    out: list[str] = []
    for i, ch in enumerate(code):
        b = digest[i % len(digest)]
        if ch.isdigit():
            out.append(chr(ord("0") + b % 10))
        else:
            out.append(chr(ord("A") + b % 26))
    return "".join(out)


def mask_phone(text: str) -> str:
    """Keep the first 2 and last 3 digits, replace the other digits with X, keep separators."""
    idx = [i for i, c in enumerate(text) if c.isdigit()]
    keep = set(idx[:2] + idx[-3:])
    return "".join("X" if (c.isdigit() and i not in keep) else c for i, c in enumerate(text))


def mask_keep_last3(token: str) -> str:
    """Mask every alphanumeric character except the last three (used for account references)."""
    alnum = [i for i, c in enumerate(token) if c.isalnum()]
    keep = set(alnum[-3:])
    return "".join("X" if (c.isalnum() and i not in keep) else c for i, c in enumerate(token))


def _is_all_caps(token: str) -> bool:
    letters = [c for c in token if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters)


@dataclass
class Span:
    start: int
    end: int
    tokens: list[str]

    @property
    def text(self) -> str:
        return " ".join(self.tokens)


def scan_name(text: str, pos: int, allow_digit_tokens: bool = True) -> Span | None:
    """Scan a counterparty name starting at `pos`.

    Tokens are separated by whitespace (newlines included, M-PESA used to wrap lines). Scanning
    stops at function words, structural keywords, tokens with digits only, punctuation or a
    sentence end. Returns None when nothing name-like is found.
    """
    i = pos
    n = len(text)
    tokens: list[str] = []
    end = pos
    while i < n:
        j = i
        while j < n and text[j].isspace():
            j += 1
        if j >= n:
            break
        if tokens and j == i:  # tokens must be whitespace separated
            break
        m = NAME_TOKEN_RE.match(text, j)
        if not m:
            break
        raw = m.group(0)
        dot = re.search(r"[A-Za-z]{2,}\.(?=[A-Za-z])", raw)
        if dot:
            raw = raw[:dot.end()]
        trailing = ""
        core = raw.rstrip(".")
        if core != raw:
            trailing = raw[len(core):]
        if not core:
            break
        if core.lower() in STOP_LOWER or core in STOP_EXACT:
            break
        if core.startswith("REDACTED"):
            break
        if core in {"&", "-", "/"}:
            break
        has_letter = any(c.isalpha() for c in core)
        has_digit = any(c.isdigit() for c in core)
        if not has_letter:
            break
        if has_digit and not allow_digit_tokens:
            break
        if PHONE_RE.fullmatch(core):
            break
        tokens.append(core)
        end = j + len(core)
        i = j + len(raw)
        if trailing:  # "MBOGO.." or "M." ends the span (sentence end), keep the dots in place
            if len(core) == 1 and core.isupper() and len(trailing) == 1:
                continue  # an initial such as "MORRIS M." may continue
            break
        # a following comma, colon, bracket or closing quote ends the span
        if i < n and text[i] in ",:;)(\"'":
            break
    if not tokens:
        return None
    return Span(pos + (len(text[pos:]) - len(text[pos:].lstrip())), end, tokens)


class Redactor:
    def __init__(self, config: SenderConfig, salt: str = "") -> None:
        self.config = config
        self.salt = salt

    # -- placeholders keep institution spans (and their short codes) safe from later rules -----
    def _protect(self, text: str, keep: list[str]) -> str:
        idx = len(keep)
        keep.append(text)
        letters = ""
        idx += 1
        while idx:
            idx, r = divmod(idx - 1, 26)
            letters = chr(ord("a") + r) + letters
        return f"{PLACEHOLDER_OPEN}{letters}{PLACEHOLDER_CLOSE}"

    @staticmethod
    def _restore(text: str, keep: list[str]) -> str:
        def repl(m: re.Match) -> str:
            n = 0
            for ch in m.group(1):
                n = n * 26 + (ord(ch) - ord("a") + 1)
            return keep[n - 1]

        return PLACEHOLDER_RE.sub(repl, text)

    # -- phone adjacency decides PERSON vs MERCHANT ------------------------------------------
    @staticmethod
    def _phone_adjacent(text: str, start: int, end: int) -> bool:
        before = text[max(0, start - 24):start]
        clause = text[end:end + 48]
        clause = re.split(r"(?<!\d)\.(?!\d)| on \d| New | has ", clause, maxsplit=1)[0]
        return any(rx.search(clause) or rx.search(before) for rx in (PHONE_RE, MASKED_PHONE_RE))

    # -- generic counterparty replacement -----------------------------------------------------
    def _replace_after_anchor(
        self,
        text: str,
        anchor_re: re.Pattern,
        keep: list[str],
        *,
        min_tokens: int = 1,
        require_all_caps: bool = False,
        label: str | None = None,
        allow_leading_phone: bool = False,
    ) -> str:
        out: list[str] = []
        pos = 0
        for m in anchor_re.finditer(text):
            if m.start() < pos:
                continue
            scan_from = m.end()
            if allow_leading_phone:
                pm = PHONE_RE.match(text, scan_from)
                if pm:
                    scan_from = pm.end()
            span = scan_name(text, scan_from)
            if span is None:
                continue
            if len(span.tokens) < min_tokens:
                continue
            if require_all_caps and not all(_is_all_caps(t) for t in span.tokens):
                continue
            if label == "dear" and all(t.lower() in DEAR_STOP for t in span.tokens):
                continue
            if self.config.is_public_counterparty(span.text):
                # keep the institution and any short codes that directly follow it
                tail = re.match(r"(?:\s+\d{1,7}(?![\d,.]))*", text[span.end:])
                prot_end = span.end + (tail.end() if tail else 0)
                out.append(text[pos:span.start])
                out.append(self._protect(text[span.start:prot_end], keep))
                pos = prot_end
                continue
            if label == "dear":
                replacement = PERSON
            elif label == "merchant":
                replacement = MERCHANT
            else:
                adjacent = self._phone_adjacent(text, span.start, span.end) or (
                    allow_leading_phone and scan_from != m.end()
                )
                replacement = PERSON if adjacent else MERCHANT
            out.append(text[pos:span.start])
            out.append(replacement)
            pos = span.end
        out.append(text[pos:])
        return "".join(out)

    # -- "for account <ref>" references ------------------------------------------------------
    FOR_ACCOUNT_RE = re.compile(r"(\bfor account\s+)", re.IGNORECASE)

    def _redact_account_refs(self, text: str, keep: list[str]) -> str:
        out: list[str] = []
        pos = 0
        for m in self.FOR_ACCOUNT_RE.finditer(text):
            if m.start() < pos:
                continue
            i = m.end()
            n = len(text)
            pieces: list[str] = []
            letters_run: list[tuple[int, int]] = []  # (start, end) of letters-only tokens
            end = i
            while i < n:
                j = i
                while j < n and text[j].isspace():
                    j += 1
                if j >= n or (pieces and j == i):
                    break
                tm = re.match(r"[^\s]+", text[j:])
                if not tm:
                    break
                tok = tm.group(0)
                core = tok.rstrip(".,;:")
                if not core or core.lower() in {"on", "new"} or core in STOP_EXACT or core.startswith("REDACTED"):
                    break
                if core.lower() == "account":
                    break
                pieces.append(core)
                end = j + len(core)
                i = j + len(core)
                if len(core) != len(tok):
                    break
            if not pieces:
                continue
            ref = text[m.end():end]
            out.append(text[pos:m.end()])
            if not any(c.isdigit() for c in ref):
                # a letters-only reference: keep single words and public institutions,
                # redact multi-word names
                span = scan_name(text, m.end())
                if span and len(span.tokens) >= 2 and not self.config.is_public_counterparty(span.text):
                    out.append(text[m.end():span.start] + MERCHANT + text[span.end:end])
                else:
                    out.append(ref)
            else:
                tokens = re.split(r"(\s+)", ref)
                rebuilt: list[str] = []
                run: list[str] = []

                def flush_run() -> None:
                    if not run:
                        return
                    words = [w for w in run if w.strip()]
                    joined = "".join(run)
                    if len(words) >= 2 and not self.config.is_public_counterparty(" ".join(words)):
                        rebuilt.append(MERCHANT + ("" if joined.endswith(words[-1]) else joined[joined.rfind(words[-1]) + len(words[-1]):]))
                    else:
                        rebuilt.append(joined)
                    run.clear()

                for tok in tokens:
                    if not tok.strip():
                        if run:
                            run.append(tok)
                        else:
                            rebuilt.append(tok)
                        continue
                    if any(c.isdigit() for c in tok):
                        flush_run()
                        if PHONE_RE.fullmatch(tok):
                            rebuilt.append(tok)  # the phone rule masks it later
                        else:
                            rebuilt.append(mask_keep_last3(tok))
                    elif any(c.isalpha() for c in tok):
                        run.append(tok)
                    else:
                        flush_run()
                        rebuilt.append(tok)
                flush_run()
                out.append("".join(rebuilt))
            pos = end
        out.append(text[pos:])
        return "".join(out)

    # -- account numbers ---------------------------------------------------------------------
    @staticmethod
    def _mask_digit_runs(text: str) -> str:
        def repl(m: re.Match) -> str:
            before = text[max(0, m.start() - 8):m.start()]
            after = text[m.end():m.end() + 3]
            if CURRENCY_BEFORE_RE.search(before):
                return m.group(0)  # an amount such as Ksh 100000.00
            if re.match(r"\.\d", after):
                return m.group(0)  # a decimal amount
            if PLACEHOLDER_OPEN in before[-1:]:
                return m.group(0)
            return "X" * (len(m.group(0)) - 3) + m.group(0)[-3:]

        return DIGIT_RUN_RE.sub(repl, text)

    # -- the rule pipeline -------------------------------------------------------------------
    ANCHOR_SUBJECT_TRANSFERRED = re.compile(r"^(\s*)([A-Z][A-Z&'./\-]*(?:\s+[A-Z][A-Z&'./\-]*)+)(?=\s+has transferred)")
    ANCHOR_WITHDRAW_AGENT = re.compile(r"Withdraw\s+(?:Ksh|KES)\s*[\d,]+(?:\.\d+)?\s+from\s+\d+\s*-\s*", re.IGNORECASE)
    ANCHOR_REFUNDED_BY = re.compile(r"\b(?:refunded|paid)\s+by\s+\d+\s*-\s*", re.IGNORECASE)
    ANCHOR_RECEIVED_AMOUNT_FROM = re.compile(r"\breceived\s+(?:Ksh|KES|Kshs)\.?\s*[\d,]+(?:\.\d+)?\s+from\s+", re.IGNORECASE)
    ANCHOR_RECEIVED_FROM = re.compile(r"\breceived\s+from\s+", re.IGNORECASE)
    ANCHOR_PAY_TO_FAILED = re.compile(r"\b(?:pay|send|buy)\s+(?:Ksh|KES)\s*[\d,]+(?:\.\d+)?(?:\s+airtime)?\s+to\s+", re.IGNORECASE)
    ANCHOR_STRONG = re.compile(r"\b(?:sent to|paid to|cash to|Received by:|imetumwa kwa|kwa)\s+", re.IGNORECASE)
    ANCHOR_DEAR = re.compile(r"\bDear\s+")
    ANCHOR_WEAK = re.compile(r"\b(?:to|from)\s+")

    def redact_body(self, body: str) -> str:
        keep: list[str] = []
        text = EMAIL_RE.sub(REDACTED_EMAIL, body)
        text = CODE_RE.sub(lambda m: remap_code(m.group(0), self.salt), text)

        # business name before "has transferred KES ... to your MPESA"
        text = self.ANCHOR_SUBJECT_TRANSFERRED.sub(lambda m: m.group(1) + MERCHANT, text)
        text = self._replace_after_anchor(text, self.ANCHOR_WITHDRAW_AGENT, keep, label="merchant")
        text = self._replace_after_anchor(text, self.ANCHOR_REFUNDED_BY, keep, label="merchant")
        text = self._replace_after_anchor(text, self.ANCHOR_RECEIVED_AMOUNT_FROM, keep, allow_leading_phone=True)
        text = self._replace_after_anchor(text, self.ANCHOR_RECEIVED_FROM, keep, allow_leading_phone=True)
        text = self._replace_after_anchor(text, self.ANCHOR_PAY_TO_FAILED, keep)
        text = self._replace_after_anchor(text, self.ANCHOR_STRONG, keep)
        text = self._replace_after_anchor(text, self.ANCHOR_DEAR, keep, label="dear")
        text = self._redact_account_refs(text, keep)
        text = self._replace_after_anchor(text, self.ANCHOR_WEAK, keep, min_tokens=2, require_all_caps=True)

        text = PHONE_RE.sub(lambda m: mask_phone(m.group(0)), text)
        text = NATIONAL_ID_RE.sub(lambda m: m.group(1) + REDACTED_ID, text)
        text = JUMBE_RE.sub(lambda m: m.group(1) + REDACTED_ID, text)
        text = self._mask_digit_runs(text)
        return self._restore(text, keep)


# --------------------------------------------------------------------------------------------
# Message family guess (anchor keywords only; a parser decides for real)
# --------------------------------------------------------------------------------------------

BANKS = (
    r"(?:KCB|EQUITY|Equity|NCBA|STANBIC|Stanbic|CO-OP|Co-op|COOP|STANDARD CHARTERED|DTB|I&M|IM BANK|"
    r"ABSA|Absa|FAMILY BANK|Family Bank|NBK|National Bank|HFC|GTBANK|SIDIAN|PRIME BANK|BANK OF AFRICA|"
    r"POSTBANK|Money Transfer|BANK|Bank)"
)
FAMILY_RULES: list[tuple[str, re.Pattern]] = [
    (name, re.compile(pattern))
    for name, pattern in [
        ("failed", r"^\s*Failed\b|Insufficient funds|not have (?:enough|sufficient) (?:money|funds)|has not joined the service|Hakuna pesa za kutosha"),
        ("fuliza_limit", r"Fuliza M-PESA limit has"),
        ("fuliza_repay", r"used to (?:fully|partially) pay your(?: outstanding)? Fuliza|Fuliza M-PESA loan of .* has been repaid"),
        ("fuliza_drawdown", r"Fuliza M-?[Pp][Ee][Ss][Aa] amount|You have used Fuliza"),
        ("reversal", r"Reversal of transaction|has been reversed|has been refunded"),
        ("mshwari_deposit", r"transferred to M-Shwari"),
        ("mshwari_withdraw", r"transferred (?:from|Ksh[\d,.]+ from) (?:your )?M-Shwari|from your M-Shwari account"),
        ("mshwari_loan", r"loan from M-Shwari|M-Shwari loan"),
        ("kcb_mpesa", r"KCB M-PESA (?:account|savings|Saving|Account)"),
        ("withdraw", r"Withdraw Ksh"),
        ("deposit", r"Give Ksh[\d,.]+ cash to"),
        ("airtime", r"of airtime|airtime for|ya mjazo"),
        ("data_bundles", r"DATA BUNDLES|POSTPAID BUNDLES|bundle"),
        ("balance", r"balance was|Baki yako ni"),
        ("jumbe", r"JumbeID"),
        ("mpesa_card", r"M-PESA CARD|GlobalPay"),
        ("global_send", r"Western Union|WorldRemit|MoneyGram"),
        ("mpesa_to_bank", r"sent to [^.]*?" + BANKS + r"[^.]*? for account"),
        ("paybill", r"sent to .* for account"),
        ("bank_to_mpesa", r"received Ksh[\d,.]+ from\s+[^.]*?" + BANKS),
        ("buy_goods", r"paid to"),
        ("send_money", r"(?:sent to|imetumwa kwa) .*?(?:0[17]\d|\+?25[4X]|\d{2}X{3,})"),
        ("send_money_no_phone", r"sent to|imetumwa kwa"),
        ("receive_money", r"You have received|received Ksh"),
        ("bank_alert", r"credited|debited"),
        ("airtel_money", r"Airtel"),
    ]
]


def guess_family(body: str) -> str:
    for name, pattern in FAMILY_RULES:
        if pattern.search(body):
            return name
    return "unknown"


# --------------------------------------------------------------------------------------------
# XML parsing and output
# --------------------------------------------------------------------------------------------


@dataclass
class RawMessage:
    address: str
    body: str
    date_ms: int
    type: str


def iter_sms(path: Path) -> Iterator[RawMessage]:
    """Stream <sms> elements out of an SMS Backup & Restore XML file (MMS parts are ignored)."""
    for _event, elem in ET.iterparse(str(path), events=("end",)):
        tag = elem.tag.rsplit("}", 1)[-1]
        if tag == "sms":
            try:
                date_ms = int(elem.get("date") or 0)
            except ValueError:
                date_ms = 0
            yield RawMessage(
                address=elem.get("address") or "",
                body=elem.get("body") or "",
                date_ms=date_ms,
                type=elem.get("type") or "",
            )
            elem.clear()
        elif tag in {"mms", "part", "addr", "parts", "addrs"}:
            elem.clear()


def to_nairobi_iso(date_ms: int) -> str:
    return datetime.fromtimestamp(date_ms / 1000, tz=NAIROBI).isoformat(timespec="seconds")


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_phone_like_address(address: str) -> bool:
    digits = re.sub(r"[^\d]", "", address)
    return len(digits) >= 7 and not any(c.isalpha() for c in address)


@dataclass
class Record:
    provider: str
    sender: str
    body: str
    received_at: str
    sha256: str
    family_guess: str

    def to_json(self) -> dict:
        return {
            "sender": self.sender,
            "provider": self.provider,
            "body": self.body,
            "received_at": self.received_at,
            "family_guess": self.family_guess,
            "redacted": True,
            "source": SOURCE_TAG,
            "redactor_version": REDACTOR_VERSION,
            "sha256": self.sha256,
        }


@dataclass
class Stats:
    total_sms: int = 0
    skipped_type: int = 0
    skipped_sender: int = 0
    kept: int = 0
    duplicates_in_input: int = 0
    already_in_corpus: int = 0
    written: int = 0
    per_sender: Counter = field(default_factory=Counter)
    per_provider: Counter = field(default_factory=Counter)
    per_family: Counter = field(default_factory=Counter)
    senders_seen: Counter = field(default_factory=Counter)
    files: dict[str, int] = field(default_factory=dict)


def process(
    export: Path,
    out_dir: Path,
    config: SenderConfig,
    *,
    all_senders: bool = False,
    include_sent: bool = False,
    dry_run: bool = False,
    salt: str = "",
    printer: Callable[[str], None] | None = None,
) -> Stats:
    redactor = Redactor(config, salt=salt)
    stats = Stats()
    seen: set[str] = set()
    grouped: dict[tuple[str, str], list[Record]] = {}

    for msg in iter_sms(export):
        stats.total_sms += 1
        if not is_phone_like_address(msg.address):
            stats.senders_seen[msg.address] += 1
        if msg.type != "1" and not (include_sent and msg.type == "2"):
            stats.skipped_type += 1
            continue
        provider = config.provider_for(msg.address)
        if provider is None:
            if not all_senders:
                stats.skipped_sender += 1
                continue
            provider = f"other/{slugify(msg.address)}"
        digest = sha256_hex(msg.body)
        if digest in seen:
            stats.duplicates_in_input += 1
            continue
        seen.add(digest)
        body = redactor.redact_body(msg.body)
        received_at = to_nairobi_iso(msg.date_ms)
        rec = Record(provider, msg.address, body, received_at, digest, guess_family(body))
        stats.kept += 1
        stats.per_sender[msg.address] += 1
        stats.per_provider[provider] += 1
        stats.per_family[rec.family_guess] += 1
        if printer:
            printer(f"[{provider}] {received_at} {rec.family_guess}: {body}")
        grouped.setdefault((provider, received_at[:7]), []).append(rec)

    for (provider, month), records in sorted(grouped.items()):
        target = out_dir / provider / f"{month}.jsonl"
        existing: dict[str, dict] = {}
        if target.exists():
            with open(target, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    obj = json.loads(line)
                    existing[obj["sha256"]] = obj
        new = 0
        for rec in records:
            if rec.sha256 in existing:
                stats.already_in_corpus += 1
                continue
            existing[rec.sha256] = rec.to_json()
            new += 1
        stats.written += new
        stats.files[str(target)] = new
        if dry_run:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        rows = sorted(existing.values(), key=lambda o: (o.get("received_at") or "", o["sha256"]))
        with open(target, "w", encoding="utf-8", newline="\n") as fh:
            for obj in rows:
                fh.write(json.dumps(obj, ensure_ascii=False) + "\n")
    return stats


def format_stats(stats: Stats, *, detailed: bool, list_senders: bool) -> str:
    lines = [
        f"sms elements: {stats.total_sms}",
        f"  skipped (not a received message): {stats.skipped_type}",
        f"  skipped (sender not allow-listed): {stats.skipped_sender}",
        f"  duplicate bodies in the export: {stats.duplicates_in_input}",
        f"  kept: {stats.kept}  (already in corpus: {stats.already_in_corpus}, new: {stats.written})",
    ]
    if stats.per_sender:
        lines.append("per sender:")
        for sender, n in stats.per_sender.most_common():
            lines.append(f"  {sender}: {n}")
    if stats.per_provider:
        lines.append("per provider:")
        for provider, n in stats.per_provider.most_common():
            lines.append(f"  {provider}: {n}")
    if stats.per_family:
        lines.append("message families (guessed from anchor keywords):")
        for family, n in stats.per_family.most_common():
            lines.append(f"  {family}: {n}")
    if detailed and stats.files:
        lines.append("files:")
        for path, n in sorted(stats.files.items()):
            lines.append(f"  {path}: +{n}")
    if list_senders:
        lines.append("alphanumeric sender IDs seen in the export (phone-number senders are not listed):")
        for sender, n in stats.senders_seen.most_common():
            lines.append(f"  {sender!r}: {n}")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="redact_sms.py",
        description="Redact an SMS Backup & Restore XML export into corpus/<provider>/<yyyy-mm>.jsonl",
    )
    p.add_argument("export", type=Path, help="XML file exported by SMS Backup & Restore (SMS only, no MMS needed)")
    p.add_argument("--out", type=Path, default=Path("corpus"), help="corpus directory (default: corpus/)")
    p.add_argument("--sender", action="append", default=[], metavar="NAME[=provider]",
                   help="extra sender ID to keep; optional provider slug, e.g. NEWBANK=banks/newbank")
    p.add_argument("--all", action="store_true", help="skip the sender filter (every received SMS is redacted and kept)")
    p.add_argument("--include-sent", action="store_true", help="also keep messages you sent (type=2)")
    p.add_argument("--senders-file", type=Path, default=DEFAULT_SENDERS_FILE, help="allow-list JSON file")
    p.add_argument("--salt", default="", help="salt for the deterministic transaction-code mapping")
    p.add_argument("--dry-run", action="store_true", help="do not write anything")
    p.add_argument("--stats", action="store_true", help="print detailed statistics")
    p.add_argument("--list-senders", action="store_true",
                   help="list alphanumeric sender IDs found in the export (to verify senders.default.json)")
    p.add_argument("--print", dest="print_bodies", action="store_true", help="print every redacted body")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.export.is_file():
        print(f"error: {args.export} is not a file", file=sys.stderr)
        return 2
    config = SenderConfig.load(args.senders_file)
    for spec in args.sender:
        config.add_override(spec)
    stats = process(
        args.export,
        args.out,
        config,
        all_senders=args.all,
        include_sent=args.include_sent,
        dry_run=args.dry_run,
        salt=args.salt,
        printer=print if args.print_bodies else None,
    )
    print(format_stats(stats, detailed=args.stats, list_senders=args.list_senders))
    if args.dry_run:
        print("dry run: nothing written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
