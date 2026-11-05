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
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(item.itertext()) for item in ElementTree.fromstring(archive.read('xl/sharedStrings.xml'))]
        for cell in row.findall("main:c", NS):
            reference = re.match(r'[A-Z]+', cell.get('r', ''))
            if reference:
                column = 0
                for letter in reference[0]:
                    column = column * 26 + ord(letter) - 64
                while len(values) < column - 1:
                    values.append('')
            if cell.get('t') == 's':
                value = shared[int(cell.find('main:v', NS).text)]
            else:
                value = ''.join(t.text or '' for t in cell.findall('.//main:t', NS))
            values.append(value)
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
                terms = split_values(row.get('Possible terms', ''))
                question_columns = sorted(
                    (key for key in headers if re.fullmatch(r'Q\d+', key)),
                    key=lambda key: int(key[1:]),
                )
                pairs = []
                for key in question_columns:
                    value = row.get(key, '').strip()
                    if value:
                        parts = re.split(r'[;\n|]', value, maxsplit=1)
                        pairs.append((parts[0].strip(), parts[1].strip() if len(parts) > 1 else ''))
                phrases = [p.strip() for p in re.split(r'[;|\n]+', row['Original phrase']) if p.strip()]
                entries.append(
                    {
                        "source": "MyHealthWord",
                        "language": language,
                        "original_phrase": phrases[0],
                        "aliases": phrases[1:],
                        "transliteration": row.get("Transliteration", "").strip(),
                        "possible_english_term": terms[0] if terms else '',
                        "other_terms": terms[1:],
                        "follow_up_questions_original": [p[0].strip() for p in pairs],
                        "follow_up_questions": [p[1] for p in pairs],
                        "creator": row.get('Creator', '').strip(),
                        "reviewer": row.get('Reviewer', '').strip(),
                        "tags": [] if row.get('Reviewer', '').strip() else ['unreviewed'],
                        "review_note": row.get("Note", "").strip(),
                    }
                )

    output_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(entries)} entries from {len(set(entry['language'] for entry in entries))} sheets to {output_path}")


if __name__ == "__main__":
    main()
