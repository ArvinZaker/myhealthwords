# MyHealthWord

MyHealthWord helps people describe symptoms across languages during a medical appointment. Search for a phrase in your own words to see possible English terms and, where available, follow-up questions in the original language with an English translation.

The follow-up questions are designed to be short, clear, and easy to answer for patients who use English as an additional language, including people learning English or more comfortable discussing their health in another language. Each question appears in the original language with an English translation underneath, so patients and clinicians can follow the same conversation. The aim is to help people share their experiences in familiar words, without needing medical vocabulary or fluent English.

[Open MyHealthWord](https://arvinzaker.github.io/myhealthwords/)

## Using the website

Type a symptom or phrase and select **Search**. **Browse all** lets you explore the records, and **I'm feeling lucky** opens a random card.

For a recognized English term, Search first asks which language you want. Type a language or choose an autocomplete suggestion, then select **Translate** or press Enter in the language field. Translation cards appear only after that step and use the stored terminology; unavailable translations are identified without inventing an answer.

Search checks the project's curated entries first. When it finds no match there, it searches the fallback terminology sources. Cards identify fallback sources and unreviewed project entries. Some records contain only terminology, so alternative terms or follow-up questions may be empty.

The current project-written samples are in Persian. Language coverage varies by source; a multilingual database does not contain every term in every language. The project-written sample interpretations and questions are drafts awaiting clinical and language review. Search results help describe a concern and do not establish a diagnosis.

## Terminology sources

- [Translators without Borders / CLEAR Global](https://clearglobal.org/resources/twb-covid-19-glossary/): multilingual COVID-19 and public-health glossary terminology.
- [MONDO International](https://mondo.monarchinitiative.org/pages/download/): disease names, exact synonyms, and available Japanese labels. MONDO is distributed under CC BY 4.0.
- [Orphadata Science](https://www.orphadata.com/_alignments/): rare-disease names and synonyms in multiple languages, linked through ORPHAcodes. Orphadata Science: Free access data from Orphanet. © INSERM 1999. Used under CC BY 4.0 and converted to search records. Source dates are retained in the JSON records. [Reuse terms](https://www.orphadata.com/faq/).
- [MedlinePlus.gov](https://medlineplus.gov/xml.html), US National Library of Medicine: English and Spanish health-topic names and alternative names, linked through the source's equivalent-topic records and converted to search records.
- [Human Phenotype Ontology (HPO)](https://obophenotype.github.io/human-phenotype-ontology/): this product uses HPO International, version 2026-09-01, from the Human Phenotype Ontology Consortium. The fallback retains source labels and exact synonyms in every language available in that release, linked to English by HP identifier. HPO does not supply follow-up questions. [HPO project citation](https://doi.org/10.1093/nar/gkt1026) and [reuse terms](https://human-phenotype-ontology.github.io/license.html).

These sources retain their respective rights and terms. Their inclusion does not imply endorsement of MyHealthWord. DeCS, NSW Health glossary content, and SNOMED CT are not included in the current website database.

## Running and hosting

This is a static website that runs on GitHub Pages. It has no patient login, dashboard, or server database. Search uses [Fuse.js](https://www.fusejs.io/), loaded from a CDN.

To preview a checkout locally, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

The public repository contains the website HTML, CSS, JavaScript, and JSON databases. `entries.json` holds the project entries; `fallbacks.json` lists one JSON file per fallback database: TWB, MONDO, Orphadata, MedlinePlus, and HPO. Shared HPO source information is stored once in its JSON and applied when loaded. Local downloads are grouped by database under `data/` and remain private, along with source workbooks, regeneration scripts, and working notes.
