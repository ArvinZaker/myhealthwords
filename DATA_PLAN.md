# Additional terminology sources

## Final incorporation decision

On the user's instruction to incorporate or exclude each source, Orphadata and MedlinePlus are incorporated in build_fallbacks.py. Both provide downloadable structured data with reuse terms documented on their official pages. Orphadata uses ORPHAcodes to link each language to the English record; MedlinePlus uses its explicit language-mapped-topic identifiers. Local-language synonyms become search aliases. No automatic translations, diagnosis inference, follow-up questions, or restricted external terminology mappings are added. Records without a supplied English counterpart retain an empty English term instead of an invented translation. Source URLs and attribution are included in generated records and linked source tags.

HPO is excluded from the live database: the current repository and downloaded ontology point to an unavailable licence page, so current reuse conditions remain unresolved. NSW is excluded: public database reuse permission has not been obtained and PDF script/alignment extraction is unverified. DeCS is excluded: its licence/access request has not been completed. These downloads remain local and ignored; they are not pipeline inputs for run_all.sh.

Integration verification: run_all.sh generated 136,963 Orphadata records and 2,033 MedlinePlus records, alongside 12,369 TWB and 85,221 MONDO records. All imported Orphadata/MedlinePlus records have source URLs and attribution; all retain empty follow-up questions. Three Orphadata records have no English counterpart in the downloaded English edition and retain an empty English field. Browser-handler checks passed for Browse all and lucky, including source links and HTML escaping. These record totals retain source-specific entries and are not deduplicated counts of clinical concepts.

Requested on 2026-11-04: make a plan, download available sources, measure what they add, and identify work needed from the project lead.

1. Download HPO International, every publicly linked Orphadata language JSON archive, MedlinePlus topic XML, and NSW glossary PDFs into ignored data/source_review/.
2. Preserve source URLs, download failures, sizes, and SHA-256 hashes in a local manifest.
3. Count concepts, language-specific labels, and exact phrase overlap with the existing website. Report candidate additions separately from clinically reviewed content.
4. Inspect reuse terms. Keep restricted materials local. DeCS requires an access/licence request; NSW website reuse needs permission. Do not add newly downloaded sources to the live site during this assessment.
5. Deliver measured results and specific remaining decisions in this file.

Sources: https://obophenotype.github.io/hpo-translations/ ; https://www.orphadata.com/_alignments/ ; https://medlineplus.gov/xml.html ; https://www.mhcs.health.nsw.gov.au/glossary/covid-19-glossary ; https://decs.bvsalud.org/

## Downloaded and measured

Assessment completed 2026-11-04. Raw datasets remain in ignored `data/source_review/`. No website database, XLSX, or deployment changed during this assessment.

Downloaded 16 principal dataset files from four sources: one HPO international OWL, 12 Orphadata language archives, one MedlinePlus ZIP, and two NSW PDFs. Additional source pages, licence pointer, and presentation were cached. The download manifest records 22 successful files, 246,319,501 bytes, and one failure: an unrelated NSW launch media-release PDF returned HTTP 401. Both requested glossary PDFs downloaded successfully.

| Source | Actual downloaded contents | Candidate phrases absent from current exact vocabulary |
|---|---|---:|
| HPO International | 19,894 non-deprecated HP classes; 234,073 distinct language–phrase pairs across 14 language codes | 226,290 |
| Orphadata | 136,963 language-specific disorder records across 12 language archives; 295,375 distinct language–phrase pairs within those files | 274,711 |
| MedlinePlus | 1,017 English and 1,016 Spanish topics; 4,050 distinct language–phrase pairs from titles and alternative names | 3,381 |
| NSW Health | Farsi and Punjabi PDFs, 26 pages each; 101 machine-extracted English glossary headings in each | Not established: bilingual alignment requires review |

The novelty counts compare each source independently against current curated, MONDO, and TWB phrases. They are exact lexical candidates, not counts of new clinical concepts, approved translations, or reviewed cards. Counts must not be summed across sources without a second cross-source deduplication. Comparison case-folds and collapses whitespace, retains language identity, and includes current original phrases, aliases, English terms and synonyms. HPO counts include labels and exact synonyms; Orphadata includes disorder names and synonyms. All results are reproducible with `python3 assess_sources.py --inventory`; the per-language results are in `data/source_review/coverage.json`.

HPO downloaded language codes: en, nl, es, pt, fr, tr, cs, zh, ja, it, de, nna, tw, dtp. No Farsi/Punjabi labels were found. A translation working-group page is not evidence that its language is present in this release.

Orphadata downloaded languages: English, Czech, Dutch, French, German, Italian, Spanish, Polish, Portuguese, Turkish, Ukrainian, Chinese. No Farsi or Punjabi archive was listed. Older Turkish, Ukrainian, and Chinese releases have different record counts, so these cannot be described as 12 complete translations of one identical release.

## Implementation order and work needed

1. **Orphadata first for a straightforward open-data addition.** Import ORPHAcodes, names, synonyms, and actual language identifiers. Use the included CC-BY-4.0 terms, preserve release dates, add attribution, and mark the source. Do not import SNOMED/MedDRA mapping text as if Orphadata licensed those vocabularies. This broadens rare-disease coverage, not everyday symptom expressions. Public-use terms: https://www.orphadata.com/faq/ . No registration was required for these files.
2. **HPO next for signs and symptoms.** Preserve HP identifiers and each label's language and translation provenance. Confirm current licence terms and translation status before website integration. The repository LICENSE.md only links to https://hpo.jax.org/app/license, which returned 404 during this assessment. That unresolved licence pointer must be resolved; do not treat a download as permission. Translation metadata documentation: https://obophenotype.github.io/hpo-translations/ .
3. **MedlinePlus for English/Spanish patient-friendly vocabulary.** Import titles, alternative names, and explicit equivalent-topic links; credit MedlinePlus. Do not scrape linked third-party articles or represent topic summaries as follow-up questions. Download/reuse guidance: https://medlineplus.gov/xml.html . No registration was required.
4. **NSW for the immediate Farsi/Punjabi gap.** Request permission from SESLHD-MHCS@health.nsw.gov.au for extracting glossary entries into a public search website. Give the exact Farsi/Punjabi resource URLs and intended use. Its website permits specified unaltered personal/organisational reproduction but reserves other uses. Then review extracted bilingual alignment and script order against rendered PDFs. Persian PDF text extraction showed reversed visual-order fragments; Punjabi extraction showed character differences between Poppler tools. The 101 headings per file are candidate counts only. Terms: https://www.mhcs.health.nsw.gov.au/about-us/copyright-and-disclaimer .
5. **DeCS remains access-on-request.** Submit its free licence/access request for the desired languages and confirm public redistribution terms. It has not been bulk-downloaded. Official description: https://www.paho.org/en/bireme/about-latin-american-and-caribbean-center-health-sciences-information .

Project-lead work: obtain NSW public reuse permission and DeCS access if desired; arrange bilingual clinical/community review of Farsi/Punjabi entries; review follow-up questions separately. None of these downloaded terminology sources supplies ready-reviewed bilingual follow-up questions for our cards. Technical work after source selection is importer integration, provenance/attribution, cross-source overlap resolution, and browser-size/performance checks before publishing. The 200-MB HPO raw OWL must be converted to selected display/search fields rather than served to browsers directly.
