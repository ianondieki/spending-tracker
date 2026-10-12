"""Tests for tools/redact-sms/redact_sms.py (unittest, standard library only).

Every message body in this file is synthetic: invented names, numbers, codes and amounts.

Run (either form works in isolated mode):
    python3 -I -m unittest discover -s tools/redact-sms -p 'test_redact_sms.py'
    python3 -I tools/redact-sms/test_redact_sms.py
Without -I the path form also works:
    python3 -m unittest tools/redact-sms/test_redact_sms.py
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("redact_sms", HERE / "redact_sms.py")
redact_sms = importlib.util.module_from_spec(_spec)
sys.modules["redact_sms"] = redact_sms
assert _spec.loader is not None
_spec.loader.exec_module(redact_sms)

FIXTURE = HERE / "fixtures" / "synthetic-export.sample.xml"

SYNTHETIC_XML = """<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<!--SYNTHETIC test fixture: nothing here is a real message-->
<smses count="6" backup_set="00000000-0000-0000-0000-000000000000" backup_date="1696100000000" type="full">
  <sms protocol="0" address="MPESA" date="1696000000000" type="1" subject="null" body="QA10TEST01 Confirmed. Ksh1,500.00 sent to TEST PERSON 0722000111 on 29/9/23 at 6:06 PM. New M-PESA balance is Ksh2,345.60. Transaction cost, Ksh23.00." read="1" status="-1" locked="0" date_sent="0" readable_date="29 Sep 2023 18:06:40" contact_name="(Unknown)" />
  <sms protocol="0" address="mpesa" date="1696003600000" type="1" subject="null" body="QA10TEST02 Confirmed.You have received Ksh500.00 from DEMO SENDER 254711000222 on 29/9/23 at 7:06 PM  New M-PESA balance is Ksh2,845.60." read="1" status="-1" locked="0" date_sent="0" readable_date="29 Sep 2023 19:06:40" contact_name="(Unknown)" />
  <sms protocol="0" address="EQUITYBANK" date="1698007200000" type="1" subject="null" body="Dear DEMO CUSTOMER, your Acc. No: 0123456789012 has been credited with KES 10,000.00 from DEMO EMPLOYER LTD. Bal: KES 12,000.00." read="1" status="-1" locked="0" date_sent="0" readable_date="22 Oct 2023 23:40:00" contact_name="(Unknown)" />
  <sms protocol="0" address="+254700000003" date="1698010800000" type="1" subject="null" body="Hi, are we still meeting at 6?" read="1" status="-1" locked="0" date_sent="0" readable_date="23 Oct 2023 00:40:00" contact_name="Demo Friend" />
  <sms protocol="0" address="MPESA" date="1698014400000" type="2" subject="null" body="BAL" read="1" status="-1" locked="0" date_sent="0" readable_date="23 Oct 2023 01:40:00" contact_name="(Unknown)" />
  <sms protocol="0" address="NEWBANK" date="1698018000000" type="1" subject="null" body="Your account 11223344556 was debited KES 1,000.00 on 23/10/23. Bal KES 9,000.00" read="1" status="-1" locked="0" date_sent="0" readable_date="23 Oct 2023 02:40:00" contact_name="(Unknown)" />
</smses>
"""


def _redactor() -> "redact_sms.Redactor":
    return redact_sms.Redactor(redact_sms.SenderConfig.load())


class RedactionRuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.r = _redactor()

    def test_phone_formats_keep_first2_last3(self) -> None:
        cases = {
            "0722000111": "07XXXXX111",
            "0112000111": "01XXXXX111",
            "254722000111": "25XXXXXXX111",
            "+254722000111": "+25XXXXXXX111",
            "0722 000 111": "07XX XXX 111",
        }
        for raw, want in cases.items():
            with self.subTest(raw=raw):
                out = self.r.redact_body(f"QA10TEST01 Confirmed. Ksh10.00 sent to TEST PERSON {raw} on 1/1/24 at 1:00 PM.")
                self.assertIn(want, out)
                self.assertNotIn(raw, out)

    def test_already_masked_number_untouched(self) -> None:
        out = self.r.redact_body("QA10TEST01 Confirmed.You have received Ksh60.00 from DEMO PERSON 0791***401 on 23/4/26 at 2:25 PM")
        self.assertIn("0791***401", out)
        self.assertIn("REDACTED PERSON", out)

    def test_transaction_code_remap_is_deterministic_and_class_preserving(self) -> None:
        a = redact_sms.remap_code("QA10TEST01")
        b = redact_sms.remap_code("QA10TEST01")
        c = redact_sms.remap_code("QA10TEST02")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertNotEqual(a, "QA10TEST01")
        self.assertEqual(len(a), 10)
        for src, dst in zip("QA10TEST01", a):
            self.assertEqual(src.isdigit(), dst.isdigit())
            self.assertEqual(src.isalpha(), dst.isalpha())
            if dst.isalpha():
                self.assertTrue(dst.isupper())
        self.assertNotEqual(redact_sms.remap_code("QA10TEST01", salt="x"), a)

    def test_same_code_maps_the_same_inside_bodies(self) -> None:
        out1 = self.r.redact_body("QA10TEST09 Confirmed. Ksh10.00 sent to TEST PERSON 0722000111 on 1/1/24 at 1:00 PM.")
        out2 = self.r.redact_body("QA10TEST10 confirmed. Reversal of transaction QA10TEST09 has been successfully reversed on 1/1/24 at 2:00 PM and Ksh10.00 is credited to your M-PESA account. New M-PESA account balance is Ksh20.00.")
        code = out1.split()[0]
        self.assertNotEqual(code, "QA10TEST09")
        self.assertIn(f"Reversal of transaction {code} has been", out2)

    def test_person_when_phone_follows_merchant_otherwise(self) -> None:
        sent = self.r.redact_body("QA10TEST01 Confirmed. Ksh100.00 sent to TEST PERSON 0722000111 on 1/1/24 at 1:00 PM. New M-PESA balance is Ksh1.00.")
        self.assertIn("sent to REDACTED PERSON 07XXXXX111 on 1/1/24", sent)
        paid = self.r.redact_body("QA10TEST01 Confirmed. Ksh300.00 paid to DEMO SHOP LIMITED. on 1/1/24 at 1:00 PM.New M-PESA balance is Ksh1.00. Transaction cost, Ksh0.00.")
        self.assertIn("paid to REDACTED MERCHANT. on 1/1/24", paid)
        received = self.r.redact_body("QA10TEST01 Confirmed.You have received Ksh500.00 from Demo Sender 254711000222 on 1/1/24 at 1:00 PM  New M-PESA balance is Ksh1.00.")
        self.assertIn("from REDACTED PERSON 25XXXXXXX222 on", received)
        pochi = self.r.redact_body("QA10TEST01 Confirmed. Ksh20.00 sent to Demo  Vendor on 2/11/23 at 9:11 AM. New M-PESA balance is Ksh1.00. To receive Money on POCHI today dial *334# & opt in.")
        self.assertIn("sent to REDACTED MERCHANT on 2/11/23", pochi)

    def test_lower_case_and_mixed_case_names_are_redacted(self) -> None:
        out = self.r.redact_body("QA10TEST01 Confirmed. Ksh10.00 sent to demo person 0722000111 on 1/1/24 at 1:00 PM.")
        self.assertNotIn("demo person", out)
        self.assertIn("REDACTED PERSON", out)
        out = self.r.redact_body("QA10TEST01 Confirmed.You have received Ksh5,000.00 from demo sender on 9/10/24 at 6:57 PM New M-PESA balance is Ksh1.00.")
        self.assertIn("from REDACTED MERCHANT on 9/10/24", out)

    def test_institutions_are_kept_with_their_short_codes(self) -> None:
        out = self.r.redact_body("QA10TEST07 Confirmed.You have received Ksh4,000.00 from KCB BANK 501901 on 22/10/23 at 10:40 PM New M-PESA balance is Ksh4,000.00.")
        self.assertIn("from KCB BANK 501901 on", out)
        out = self.r.redact_body("QA10TEST08 Confirmed.You have received Ksh3,000.00 from STANBIC to MPESA Retail 300248 on 1/1/24 at 5:31 PM New M-PESA balance is Ksh3,000.00.")
        self.assertIn("from STANBIC to", out)
        out = self.r.redact_body("QA10TEST08 Confirmed. Ksh80.00 sent to Equity Paybill Account for account 0722000790 on 20/6/26 at 8:13 PM New M-PESA balance is Ksh1.00.")
        self.assertIn("sent to Equity Paybill Account for account 07XXXXX790 on", out)
        out = self.r.redact_body("QA10TEST08 Confirmed. Ksh20.00 sent to SAFARICOM DATA BUNDLES for account SAFARICOM DATA BUNDLES on 20/6/26 at 7:05 PM. New M-PESA balance is Ksh1.00.")
        self.assertIn("sent to SAFARICOM DATA BUNDLES for account SAFARICOM DATA BUNDLES on", out)

    def test_mshwari_kcb_and_fuliza_wording_untouched(self) -> None:
        bodies = [
            "QA10TEST11 Confirmed.Ksh1,200.00 transferred from M-Shwari account on 8/3/25 at 2:29 PM. M-Shwari balance is Ksh305.91 .M-PESA balance is Ksh1,329.15 .Transaction cost Ksh.0.00",
            "QA10TEST12 Confirmed. Ksh50.00 transferred to M-Shwari account on 13/10/13 at 2:13 AM. M-PESA balance is Ksh4,265.00, new M-Shwari account balance is Ksh20,087.69.",
            "QA10TEST13 Confirmed. You have transfered Ksh15,000.00 from your KCB M-PESA account on 3/6/26 at 4:27 PM. KCB M-PESA Account balance is Ksh0.17. New M-PESA balance is Ksh15,000.00.",
            "QA10TEST14 Confirmed. Ksh 4940.16 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 7100.00. M-PESA balance is Ksh19,559.84",
            "QA10TEST15 Confirmed. Fuliza M-PESA amount is Ksh 100.00. Interest charged Ksh 1.00. Total Fuliza M-PESA outstanding amount is Ksh 422.93 due on 06/01/24. To check daily charges, Dial *234*0#OK Select Query Charges",
        ]
        for body in bodies:
            with self.subTest(body=body[:30]):
                out = self.r.redact_body(body)
                self.assertEqual(out.split(" ", 1)[1], body.split(" ", 1)[1])
                self.assertNotIn("REDACTED", out)

    def test_withdraw_agent_and_deposit(self) -> None:
        out = self.r.redact_body("QA10TEST05 Confirmed.on 30/9/23 at 10:33 PMWithdraw Ksh1,000.00 from 123456 - Demo Agent Shop Somewhere New M-PESA balance is Ksh3,000.00. Transaction cost, Ksh29.00.")
        self.assertIn("Withdraw Ksh1,000.00 from XXX456 - REDACTED MERCHANT New M-PESA balance is Ksh3,000.00. Transaction cost, Ksh29.00.", out)
        out = self.r.redact_body("QA10TEST16 Confirmed. On 23/6/25 at 10:58 AM Give Ksh10,000.00 cash to Demo Communication SOMEWHERE New M-PESA balance is Ksh10,000.00. You can now access M-PESA via *334#")
        self.assertIn("Give Ksh10,000.00 cash to REDACTED MERCHANT New M-PESA balance is Ksh10,000.00.", out)
        old = self.r.redact_body("QA10TEST17 Confirmed.\non 20/2/14 at 2:44 PM\nWithdraw Ksh16,000.00 from\n129324 - Demo Link Agency Some Road\nNew M-PESA balance is Ksh570.00.Save & get a loan on MShwari")
        self.assertIn("from\nXXX324 - REDACTED MERCHANT\nNew M-PESA balance is Ksh570.00.", old)

    def test_received_from_with_phone_before_name(self) -> None:
        out = self.r.redact_body("QA10TEST18 Confirmed.\non 28/9/13 at 1:14 PM\nKsh50.00 received from\n254729000024 DEMO M.\nNew Account balance is Ksh54.00")
        self.assertIn("received from\n25XXXXXXX024 REDACTED PERSON.\nNew Account balance is Ksh54.00", out)

    def test_account_numbers_keep_last_three(self) -> None:
        out = self.r.redact_body("QA10TEST03 Confirmed. Ksh2,400.00 sent to KPLC PREPAID for account 12345678901 on 29/9/23 at 8:46 PM New M-PESA balance is Ksh445.60. Transaction cost, Ksh33.00.")
        self.assertIn("for account XXXXXXXX901 on", out)
        out = self.r.redact_body("Jumbe: TILL: 5678900. Your JumbeID: NK_74. Date: 2026-06-10 at 14:56:38.")
        self.assertIn("TILL: XXXX900.", out)
        self.assertIn("JumbeID: REDACTED ID.", out)
        self.assertIn("Date: 2026-06-10 at 14:56:38.", out)

    def test_for_account_alphanumeric_and_name_refs(self) -> None:
        out = self.r.redact_body("QA10TEST19 Confirmed. Ksh50.00 sent to DEMO HOLDINGS LIMITED for account KCD082C on 24/6/25 at 5:10 PM New M-PESA balance is Ksh0.00.")
        self.assertIn("sent to REDACTED MERCHANT for account XXXX82C on 24/6/25", out)
        out = self.r.redact_body("QA10TEST20 Confirmed. Ksh14,980.00 sent to DEMO HOSPITAL LTD for account james demo on 6/9/25 at 10:56 AM New M-PESA balance is Ksh0.00.")
        self.assertIn("for account REDACTED MERCHANT on 6/9/25", out)
        out = self.r.redact_body("QA10TEST21 Confirmed. Ksh60.00 sent to DEMO LIMITED for account 33536889;161371 on 20/6/25 at 4:18 PM New M-PESA balance is Ksh1.00.")
        self.assertIn("for account XXXXXXXX;XXX371 on", out)
        out = self.r.redact_body("QA10TEST22 Confirmed. Ksh15,000.00 sent to DEMO APARTMENTS for account RENT on 2/6/26 at 8:09 AM. New M-PESA balance is Ksh1.00.")
        self.assertIn("for account RENT on", out)

    def test_national_id_and_email(self) -> None:
        out = self.r.redact_body("Dear DEMO CUSTOMER, ID No 12345678 registered. ID: 1234567. Write to demo.person@example.org")
        self.assertIn("ID No REDACTED ID", out)
        self.assertIn("ID: REDACTED ID", out)
        self.assertIn("redacted@example.com", out)
        self.assertNotIn("demo.person", out)
        self.assertTrue(out.startswith("Dear REDACTED PERSON,"))
        self.assertIn("Dear customer,", self.r.redact_body("Dear customer, you do not have sufficient funds."))

    def test_weak_anchors_only_all_caps_runs(self) -> None:
        out = self.r.redact_body("Dear customer, you do not have sufficient funds in your M-PESA account to pay Ksh350.87 to DEMO MUSIC AB     STOCKHOLM  SE.Your M-PESA balance is Ksh0.00.")
        self.assertIn("to pay Ksh350.87 to REDACTED MERCHANT.Your M-PESA balance is Ksh0.00.", out)
        out = self.r.redact_body("Failed. You do not have enough money in your M-PESA account to pay Ksh50.00 to Demo Person Name. Your M-PESA balance is Ksh20.50.")
        self.assertIn("to pay Ksh50.00 to REDACTED MERCHANT. Your M-PESA balance is Ksh20.50.", out)
        out = self.r.redact_body("To move money from bank to M-PESA, dial *334#>Withdraw>From bank to MPESA")
        self.assertEqual(out, "To move money from bank to M-PESA, dial *334#>Withdraw>From bank to MPESA")

    def test_bank_alert_and_subject_before_has_transferred(self) -> None:
        out = self.r.redact_body("DEMO COMPUTER SOLUTION LTD has transferred KES 37500.00 to your MPESA account 0722000111.")
        self.assertTrue(out.startswith("REDACTED MERCHANT has transferred KES 37500.00 to your MPESA account 07XXXXX111."))
        out = self.r.redact_body("Dear DEMO CUSTOMER, your Acc. No: 0123456789012 has been credited with KES 10,000.00 from DEMO EMPLOYER LTD. Bal: KES 12,000.00.")
        self.assertEqual(out, "Dear REDACTED PERSON, your Acc. No: XXXXXXXXXX012 has been credited with KES 10,000.00 from REDACTED MERCHANT. Bal: KES 12,000.00.")

    def test_swahili_send(self) -> None:
        out = self.r.redact_body("QA10TEST23 Imethibitishwa Ksh1.00 imetumwa kwa Demo Mtu 0769000937 tarehe 13/1/25 saa 5:44 PM. Baki yako ya M-PESA ni Ksh263.47. Gharama ya kutuma ni Ksh0.00.")
        self.assertIn("imetumwa kwa REDACTED PERSON 07XXXXX937 tarehe 13/1/25 saa 5:44 PM. Baki yako ya M-PESA ni Ksh263.47. Gharama ya kutuma ni Ksh0.00.", out)

    def test_amounts_dates_and_anchors_survive(self) -> None:
        body = ("QA10TEST01 Confirmed. Ksh1,500.00 sent to TEST PERSON 0722000111 on 29/9/23 at 6:06 PM. "
                "New M-PESA balance is Ksh2,345.60. Transaction cost, Ksh23.00. Amount you can transact within the day is 498,500.00. "
                "To reverse, forward this message to 456.")
        out = self.r.redact_body(body)
        for token in ["Confirmed.", "Ksh1,500.00", "on 29/9/23 at 6:06 PM.", "New M-PESA balance is Ksh2,345.60.",
                      "Transaction cost, Ksh23.00.", "Amount you can transact within the day is 498,500.00.",
                      "forward this message to 456."]:
            self.assertIn(token, out)
        big = self.r.redact_body("QA10TEST24 Confirmed. Ksh 100000.00 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza M-PESA limit is Ksh 150000.00. M-PESA balance is Ksh1000000.00")
        for token in ["Ksh 100000.00", "Ksh 150000.00", "Ksh1000000.00"]:
            self.assertIn(token, big)


class FamilyGuessTests(unittest.TestCase):
    def test_family_guesses(self) -> None:
        cases = {
            "send_money": "QA Confirmed. Ksh10.00 sent to REDACTED PERSON 07XXXXX111 on 1/1/24 at 1:00 PM.",
            "send_money_no_phone": "QA Confirmed. Ksh10.00 sent to REDACTED MERCHANT on 1/1/24 at 1:00 PM.",
            "receive_money": "QA Confirmed.You have received Ksh10.00 from REDACTED PERSON 07XXXXX111 on 1/1/24",
            "bank_to_mpesa": "QA Confirmed.You have received Ksh10.00 from KCB BANK 501901 on 1/1/24",
            "paybill": "QA Confirmed. Ksh10.00 sent to REDACTED MERCHANT for account XXX123 on 1/1/24",
            "mpesa_to_bank": "QA Confirmed. Ksh10.00 sent to Equity Paybill Account for account 07XXXXX111 on 1/1/24",
            "buy_goods": "QA Confirmed. Ksh10.00 paid to REDACTED MERCHANT. on 1/1/24",
            "withdraw": "QA Confirmed.on 1/1/24 at 1:00 PMWithdraw Ksh10.00 from XXX456 - REDACTED MERCHANT New M-PESA balance is Ksh1.00.",
            "deposit": "QA Confirmed. On 1/1/24 at 1:00 PM Give Ksh10.00 cash to REDACTED MERCHANT New M-PESA balance is Ksh1.00.",
            "airtime": "QA confirmed.You bought Ksh10.00 of airtime on 1/1/24 at 1:00 PM.New M-PESA balance is Ksh1.00.",
            "data_bundles": "QA Confirmed. Ksh20.00 sent to SAFARICOM DATA BUNDLES for account SAFARICOM DATA BUNDLES on 1/1/24",
            "fuliza_drawdown": "QA Confirmed. Fuliza M-PESA amount is Ksh 10.00. Access Fee charged Ksh 0.10.",
            "fuliza_repay": "QA Confirmed. Ksh 10.00 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA.",
            "mshwari_withdraw": "QA Confirmed.Ksh10.00 transferred from M-Shwari account on 1/1/24 at 1:00 PM.",
            "mshwari_deposit": "QA Confirmed. Ksh10.00 transferred to M-Shwari account on 1/1/24 at 1:00 PM.",
            "kcb_mpesa": "QA Confirmed. You have transfered Ksh10.00 from your KCB M-PESA account on 1/1/24.",
            "reversal": "QA confirmed. Reversal of transaction QB has been successfully reversed on 1/1/24",
            "balance": "QA Confirmed. Your account balance was: M-PESA Account : Ksh3.51 on 1/1/24",
            "failed": "Failed. Insufficient funds in your M-PESA account to buy Ksh20.00 airtime.",
            "jumbe": "QA Confirmed. You sent: Ksh2,000.00. Received by: REDACTED MERCHANT Till. TILL: XXXX900. Your JumbeID: REDACTED ID.",
            "bank_alert": "Dear REDACTED PERSON, your Acc. No: XXX012 has been credited with KES 10,000.00.",
            "unknown": "Hello there",
            "send_money_sw": "QA Imethibitishwa Ksh1.00 imetumwa kwa REDACTED PERSON 07XXXXX937 tarehe 13/1/25 saa 5:44 PM.",
        }
        for family, body in cases.items():
            with self.subTest(family=family):
                self.assertEqual(redact_sms.guess_family(body), family.removesuffix("_sw"))
        wrapped = "QA Confirmed.\nYou have received Ksh3,500.00 from\nXXX901 - KCB Money Transfer Services \non 31/7/13 at 6:43 PM\nNew M-PESA balance is Ksh11,312.00."
        self.assertEqual(redact_sms.guess_family(wrapped), "bank_to_mpesa")


class EndToEndTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.export = self.root / "export.xml"
        self.export.write_text(SYNTHETIC_XML, encoding="utf-8")
        self.out = self.root / "corpus"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _run(self, *argv: str) -> int:
        return redact_sms.main([str(self.export), "--out", str(self.out), *argv])

    def _rows(self) -> list[dict]:
        rows = []
        for path in sorted(self.out.rglob("*.jsonl")):
            for line in path.read_text(encoding="utf-8").splitlines():
                obj = json.loads(line)
                obj["_path"] = path.relative_to(self.out).as_posix()
                rows.append(obj)
        return rows

    def test_default_filter_paths_and_fields(self) -> None:
        self.assertEqual(self._run(), 0)
        rows = self._rows()
        paths = sorted({r["_path"] for r in rows})
        self.assertEqual(paths, ["banks/equity/2023-10.jsonl", "mpesa/2023-09.jsonl"])
        self.assertEqual(len(rows), 3)
        senders = sorted(r["sender"] for r in rows)
        self.assertEqual(senders, ["EQUITYBANK", "MPESA", "mpesa"])  # case-insensitive match, original kept
        mpesa = [r for r in rows if r["provider"] == "mpesa"]
        self.assertEqual(len(mpesa), 2)
        first = next(r for r in mpesa if r["body"].endswith("Transaction cost, Ksh23.00."))
        original = ("QA10TEST01 Confirmed. Ksh1,500.00 sent to TEST PERSON 0722000111 on 29/9/23 at 6:06 PM. "
                    "New M-PESA balance is Ksh2,345.60. Transaction cost, Ksh23.00.")
        self.assertEqual(first["sha256"], hashlib.sha256(original.encode("utf-8")).hexdigest())
        self.assertNotEqual(first["body"], original)
        self.assertIn("sent to REDACTED PERSON 07XXXXX111 on 29/9/23 at 6:06 PM.", first["body"])
        self.assertEqual(first["received_at"], "2023-09-29T18:06:40+03:00")
        self.assertIs(first["redacted"], True)
        self.assertEqual(first["source"], "sms-backup-xml")
        self.assertEqual(first["family_guess"], "send_money")
        for key in ("sender", "provider", "body", "received_at", "redacted", "source", "sha256", "family_guess"):
            self.assertIn(key, first)
        text = "\n".join(r["body"] for r in rows)
        for leak in ("0722000111", "254711000222", "TEST PERSON", "DEMO SENDER", "DEMO EMPLOYER", "0123456789012", "QA10TEST01"):
            self.assertNotIn(leak, text)
        self.assertNotIn("Demo Friend", text)

    def test_all_and_sender_override(self) -> None:
        self.assertEqual(self._run("--all"), 0)
        providers = sorted({r["provider"] for r in self._rows()})
        self.assertEqual(providers, ["banks/equity", "mpesa", "other/254700000003", "other/newbank"])

        out2 = self.root / "corpus2"
        rc = redact_sms.main([str(self.export), "--out", str(out2), "--sender", "NEWBANK=banks/newbank"])
        self.assertEqual(rc, 0)
        providers = sorted({r["provider"] for r in self._rows_in(out2)})
        self.assertEqual(providers, ["banks/equity", "banks/newbank", "mpesa"])

    def _rows_in(self, out: pathlib.Path) -> list[dict]:
        rows = []
        for path in sorted(out.rglob("*.jsonl")):
            rows.extend(json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip())
        return rows

    def test_sent_messages_skipped_unless_requested(self) -> None:
        self._run()
        self.assertFalse(any(r["body"] == "BAL" for r in self._rows()))
        self._run("--include-sent")
        self.assertTrue(any(r["body"] == "BAL" for r in self._rows()))

    def test_rerun_is_idempotent_and_dedupes(self) -> None:
        self._run()
        before = self._rows()
        self._run()
        after = self._rows()
        self.assertEqual(before, after)
        self.assertEqual(len({r["sha256"] for r in after}), len(after))

    def test_dry_run_writes_nothing(self) -> None:
        self.assertEqual(self._run("--dry-run", "--stats"), 0)
        self.assertFalse(self.out.exists())

    def test_sample_fixture_runs(self) -> None:
        out = self.root / "sample"
        rc = redact_sms.main([str(FIXTURE), "--out", str(out), "--stats"])
        self.assertEqual(rc, 0)
        rows = self._rows_in(out)
        self.assertEqual(len(rows), 8)  # 7 MPESA bodies (one duplicate dropped) + 1 EQUITYBANK
        families = {r["family_guess"] for r in rows}
        self.assertTrue({"send_money", "receive_money", "paybill", "buy_goods", "withdraw", "fuliza_drawdown", "bank_to_mpesa", "bank_alert"} <= families)
        text = "\n".join(r["body"] for r in rows)
        self.assertNotIn("12345678901", text)
        self.assertNotIn("demo.person@example.org", text)
        self.assertNotIn("Demo Agent", text)


if __name__ == "__main__":
    unittest.main()
