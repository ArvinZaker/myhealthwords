# MyHealthWord

Local source: ignored `data/data.xlsx`, Farsi and Punjabi sheets.
Columns: Original phrase, Possible terms, Q1 onward, Creator, Reviewer, Note.
Original phrases accept semicolon, pipe, or newline. Each Q cell contains an original-language question and English translation separated by semicolon, pipe, or newline.

`data/data.xlsx` → `import_workbook.py` → root `entries.json`.
`data/twb.js` and local DEFINITIONS SNOMED/MONDO releases → `build_fallbacks.py` → root `fallback-*.json` and `fallbacks.json`.
`./run_all.sh` regenerates both databases. Original source databases are read in place and never modified.

The browser loads the manifest shards and curated records. Browse all displays successive batches; lucky selects a record. No source-record selection limit is applied during fallback generation.
Source versions: SNOMED International 20261001, US 20260901, MONDO 2026-10-06; TWB COVID-19 app bundle.
Local verification on 2026-11-04: TWB 12,369 records; SNOMED 395,081 active concepts; MONDO 58,690 non-obsolete concepts. Imported terminology does not supply new translations or follow-up questions.
