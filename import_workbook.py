#!/usr/bin/env python3
"""Import the clinician workbook into the website JSON database."""

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def split_values(value):
    return [part.strip() for part in re.split(r"[;\n]+", value or "") if part.strip()]


def read_sheet(archive, sheet_path):
    root = ElementTree.fromstring(archive.read(sheet_path))
    rows = []
    for row in root.findall("main:sheetData/main:row", NS):
        values = []
        for cell in row.findall("main:c", NS):
            text = cell.find("main:is/main:t", NS)
            values.append(text.text if text is not None and text.text else "")
        rows.append(values)
    return rows


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: import_workbook.py workbook.xlsx data/entries.json")

    workbook_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    entries = []
    with zipfile.ZipFile(workbook_path) as archive:
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            relationship.attrib["Id"]: "xl/" + relationship.attrib["Target"]
            for relationship in relationships.findall("pkg:Relationship", NS)
        }

        for sheet in workbook.findall("main:sheets/main:sheet", NS):
            language = sheet.attrib["name"]
            rows = read_sheet(archive, targets[sheet.attrib["{%s}id" % NS["rel"]]])
            if not rows:
                continue
            headers = rows[0]
            for values in rows[1:]:
                row = dict(zip(headers, values))
                if not row.get("Original phrase", "").strip():
                    continue
                entries.append(
                    {
                        "source": row.get("Source", "").strip(),
                        "language": language,
                        "original_phrase": row["Original phrase"].strip(),
                        "transliteration": row.get("Transliteration", "").strip(),
                        "possible_english_term": row.get("Possible English term", "").strip(),
                        "other_terms": split_values(row.get("Other possible terms", "")),
                        "follow_up_questions_original": split_values(row.get("Follow-up questions (original language)", "")),
                        "follow_up_questions": split_values(row.get("Follow-up questions (English)", "")),
                        "tags": split_values(row.get("Tag", "")),
                        "review_note": row.get("Review note", "").strip(),
                    }
                )

    output_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(entries)} entries from {len(set(entry['language'] for entry in entries))} sheets to {output_path}")


if __name__ == "__main__":
    main()
