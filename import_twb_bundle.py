#!/usr/bin/env python3
"""Extract embedded multilingual glossary records from a TWB app bundle."""

import ast
import json
import re
import sys
from pathlib import Path

MANUAL_PERSIAN = [
    ("سردی", "feeling cold / coldness"),
    ("گز گز", "tingling / pins and needles"),
    ("بی‌حسی", "numbness"),
    ("خناق", "sore throat / choking sensation"),
    ("زردی", "jaundice / yellowing"),
    ("سفیدک", "white patches / thrush"),
    ("قرمز", "redness"),
]


def load_glossary(bundle_path):
    bundle = Path(bundle_path).read_text(encoding="utf-8")
    pattern = re.compile(r"JSON\.parse\('((?:\\.|[^'\\])*)'\)")

    for match in pattern.finditer(bundle):
        encoded = match.group(1)
        decoded = ast.literal_eval("'" + encoded + "'")
        payload = json.loads(decoded)
        if "glossary" in payload:
            return payload["glossary"]

    raise ValueError("No embedded TWB glossary records found")


def convert(records):
    entries = []
    for record in records:
        english = record.get("English", {})
        english_term = english.get("term", "").strip()
        if not english_term:
            continue

        for language, value in record.items():
            if language in {"id", "Sector", "English"} or not isinstance(value, dict):
                continue
            term = value.get("term", "").strip()
            if not term:
                continue
            entries.append(
                {
                    "source": "TWB COVID-19 glossary",
                    "original_phrase": term,
                    "language": language,
                    "transliteration": value.get("alternative", "").strip(),
                    "literal_translation": english_term,
                    "possible_english_term": english_term,
                    "other_terms": [],
                    "plain_language_meaning": english.get("definition", "").strip(),
                    "follow_up_questions": [],
                }
            )

    return sorted(entries, key=lambda entry: (entry["language"], entry["original_phrase"].casefold()))


def add_manual_persian(entries):
    for phrase, english_term in MANUAL_PERSIAN:
        entries.append(
            {
                "source": "MyHealthWord sample",
                "original_phrase": phrase,
                "language": "Farsi",
                "transliteration": "",
                "literal_translation": "",
                "possible_english_term": english_term,
                "other_terms": [],
                "plain_language_meaning": "",
                "follow_up_questions": [],
            }
        )
    return sorted(entries, key=lambda entry: (entry["language"], entry["original_phrase"].casefold()))


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: import_twb_bundle.py TWB_APP.js data/entries.json")

    entries = add_manual_persian(convert(load_glossary(sys.argv[1])))
    output_path = Path(sys.argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(entries)} entries to {output_path}")


if __name__ == "__main__":
    main()
