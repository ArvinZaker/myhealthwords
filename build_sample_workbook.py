#!/usr/bin/env python3
"""Build the clinician-facing sample workbook without third-party packages."""

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


HEADERS = [
    "Original phrase",
    "Transliteration",
    "Possible English term",
    "Other possible terms",
    "Follow-up questions (original language)",
    "Follow-up questions (English)",
    "Tag",
    "Source",
    "Review note",
]

PERSIAN = [
    ("اسهال", "eshāl", "diarrhea", "loose stools; frequent watery stools", "از کی شروع شده؟\nچند بار در روز؟\nخون در مدفوع، تب، یا درد شدید دارید؟\nمی‌توانید مایعات را نگه دارید؟", "How long has it been happening?\nHow many times a day?\nIs there blood, fever, or severe pain?\nCan you keep fluids down?", "unreviewed", "Manual draft", "Follow-up wording requires clinical review."),
    ("سردی", "", "feeling cold / coldness", "chills; feeling unusually cold", "احساس سرما دارید یا لرز؟\nتب دارید؟\nاز کی شروع شده؟", "Do you feel cold or have chills?\nDo you have a fever?\nWhen did it start?", "unreviewed", "Manual draft", "Context-dependent expression; clinician and community review needed."),
    ("گز گز", "gaz gaz", "tingling / pins and needles", "prickling; paresthesia", "بی‌حسی، سوزش، درد یا ضعف هم دارید؟\nگزگز کجای بدن است؟\nهمیشه هست یا گاهی می‌آید؟", "Is there numbness, burning, pain, or weakness?\nWhere is the tingling?\nIs it always there or does it come and go?", "unreviewed", "Manual draft", "Colloquial expression; clinician and community review needed."),
    ("بی‌حسی", "bi-hessi", "numbness", "loss of sensation; reduced sensation", "بی‌حسی کجای بدن است؟\nناگهانی شروع شد؟\nضعف یا مشکل در حرف زدن دارید؟", "Where is the numbness?\nDid it start suddenly?\nDo you have weakness or trouble speaking?", "unreviewed", "Manual draft", "Needs context about location, onset, and associated weakness or pain."),
    ("خناق", "", "throat tightness / choking sensation", "sore throat; difficulty swallowing", "نفس کشیدن یا قورت دادن سخت است؟\nگلودرد یا ورم دارید؟\nاز کی شروع شده؟", "Is breathing or swallowing difficult?\nDo you have throat pain or swelling?\nWhen did it start?", "unreviewed", "Manual draft", "Meaning varies by context; clinician and community review needed."),
    ("زردی", "zardi", "jaundice / yellowing", "yellow skin; yellow eyes", "زردی پوست است یا سفیدی چشم؟\nادرار تیره‌تر شده؟\nاز کی شروع شده؟", "Is the yellowing in the skin or the whites of the eyes?\nIs your urine darker than usual?\nWhen did it start?", "unreviewed", "Manual draft", "Needs clarification about skin or eye colour and onset."),
    ("سفیدک", "sefidak", "white patches / thrush", "oral white patches; candidiasis", "سفیدی کجاست؟\nبا پاک کردن می‌رود؟\nدرد دارد؟", "Where are the white patches?\nDo they come off when wiped?\nAre they painful?", "unreviewed", "Manual draft", "Location and appearance require review."),
    ("قرمز", "ghermez", "redness", "erythema; flushed skin", "قرمزی کجاست؟\nخارش، درد، ورم یا گرمی دارد؟\nاز کی شروع شده؟", "Where is the redness?\nIs there itching, pain, swelling, or warmth?\nWhen did it start?", "unreviewed", "Manual draft", "Descriptive word; body location is required."),
]


def safe_sheet_name(name):
    return re.sub(r"[\\/*?:\[\]]", "_", name)[:31]


def xml_cell(value):
    return f'<c t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'


def sheet_xml(rows):
    all_rows = [HEADERS] + rows
    body = []
    for row_number, row in enumerate(all_rows, 1):
        cells = "".join(xml_cell(value) for value in row)
        body.append(f'<row r="{row_number}">{cells}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0" rightToLeft="0"/></sheetViews>'
        '<cols><col min="1" max="8" width="28" customWidth="1"/></cols>'
        f'<sheetData>{"".join(body)}</sheetData></worksheet>'
    )


def main():
    data_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    entries = json.loads(data_path.read_text(encoding="utf-8"))

    language_sources = {
        "Arabic": ["Arabic_sa", "Arabic_shuwa_ar", "Arabic_shuwa_lt"],
        "French": ["French_fr"],
        "Spanish": ["Spanish_es", "Spanish_latam"],
    }
    sheets = {"Persian": PERSIAN}
    for sheet_name, language_names in language_sources.items():
        rows = []
        for entry in entries:
            if entry["language"] in language_names and len(rows) < 25:
                rows.append(
                    [
                        entry["original_phrase"],
                        entry["transliteration"],
                        entry["possible_english_term"],
                        "",
                        "",
                        "",
                        "TWB fallback",
                        entry["source"],
                        "Imported from TWB glossary; clinician review required.",
                    ]
                )
        sheets[sheet_name] = rows

    sheets["Punjabi"] = [[
        "",
        "",
        "",
        "",
        "",
        "",
        "fallback; unreviewed",
        "No Punjabi entries in imported TWB glossary",
        "Add Punjabi phrases for review.",
    ]]

    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets>'
        + "".join(
            f'<sheet name="{escape(safe_sheet_name(name))}" sheetId="{i}" r:id="rId{i}"/>'
            for i, name in enumerate(sheets, 1)
        )
        + '</sheets></workbook>'
    )
    relationships = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(
            f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        + '</Relationships>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + "".join(
            f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        + '</Types>'
    )
    root_relationships = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as workbook_zip:
        workbook_zip.writestr("[Content_Types].xml", content_types)
        workbook_zip.writestr("_rels/.rels", root_relationships)
        workbook_zip.writestr("xl/workbook.xml", workbook)
        workbook_zip.writestr("xl/_rels/workbook.xml.rels", relationships)
        for i, rows in enumerate(sheets.values(), 1):
            workbook_zip.writestr(f"xl/worksheets/sheet{i}.xml", sheet_xml(rows))

    print(f"Wrote {len(sheets)} sheets to {output_path}")


if __name__ == "__main__":
    main()
