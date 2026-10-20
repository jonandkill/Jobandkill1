import copy
import json
import unittest
from pathlib import Path

from carousel_copy_guard import CTA, validate


BASE = Path(__file__).resolve().parents[1]


class CarouselCopyGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.batch_paths = sorted((BASE / "compact_batches").glob("batch_*.json"))
        cls.data = json.loads(cls.batch_paths[0].read_text(encoding="utf-8"))

    def check(self, mutate=None):
        data = copy.deepcopy(self.data)
        if mutate:
            mutate(data)
        return validate(data)

    def test_every_compact_batch_passes_density_gate(self):
        self.assertGreaterEqual(len(self.batch_paths), 2)
        for path in self.batch_paths:
            with self.subTest(path=path.name):
                result = validate(json.loads(path.read_text(encoding="utf-8")))
                self.assertEqual(result["errors"], [])
                self.assertFalse(result["publication_approved"])

    def test_valid_batch_is_not_publication_approval(self):
        result = self.check()
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["status"], "TEXT_DENSITY_VALID_PUBLICATION_UNAPPROVED")
        self.assertFalse(result["publication_approved"])

    def test_original_question_hash_is_immutable(self):
        result = self.check(lambda d: d["items"][0].update(original_question="changed"))
        self.assertTrue(any("hash mismatch" in x for x in result["errors"]))

    def test_six_slides_are_required(self):
        result = self.check(lambda d: d["items"][0]["slides"].pop())
        self.assertTrue(any("six ordered slides" in x for x in result["errors"]))

    def test_over_budget_copy_fails(self):
        result = self.check(lambda d: d["items"][0]["slides"][2].update(body="가" * 61))
        self.assertTrue(any("visible characters" in x for x in result["errors"]))

    def test_authored_line_limit_fails(self):
        result = self.check(lambda d: d["items"][0]["slides"][2].update(body="가\n나\n다\n라"))
        self.assertTrue(any("authored lines" in x for x in result["errors"]))

    def test_four_steps_are_required(self):
        result = self.check(lambda d: d["items"][0]["slides"][3]["steps"].pop())
        self.assertTrue(any("exactly four" in x for x in result["errors"]))

    def test_exact_cta_is_required(self):
        result = self.check(lambda d: d["items"][0]["slides"][5].update(cta=CTA + "!"))
        self.assertTrue(any("CTA mismatch" in x for x in result["errors"]))

    def test_disclosure_is_not_repeated_on_cards(self):
        result = self.check(lambda d: d["items"][0]["slides"][1].update(body="이해를 돕기 위한 가상 사례"))
        self.assertTrue(any("repeats a disclosure" in x for x in result["errors"]))


if __name__ == "__main__":
    unittest.main()
