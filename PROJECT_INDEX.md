# MyHealthWord

Local source: ignored `data/data.xlsx`, Farsi and Punjabi sheets.
Columns: Original phrase, Possible terms, Q1 onward, Creator, Reviewer, Note.
Original phrases accept semicolon, pipe, or newline. Each Q cell contains an original-language question and English translation separated by semicolon, pipe, or newline.

`data/data.xlsx` → `import_workbook.py` → root `entries.json`.
`data/twb.js` and local DEFINITIONS MONDO release → `build_fallbacks.py` → root `fallback-*.json` and `fallbacks.json`.
`./run_all.sh` regenerates both databases. Original source databases are read in place and never modified.

The browser loads the manifest shards and curated records. Browse all displays successive batches; lucky selects a record. No source-record selection limit is applied during fallback generation.
Source versions: MONDO International 2026-10-06; TWB COVID-19 app bundle.
SNOMED fallback generation and public shards were removed at the user's request. Historical Git commits still contain the previously published shards.
MONDO includes English terminology and Japanese labels. Imported terminology does not supply new translations or follow-up questions.
