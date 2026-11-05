#!/usr/bin/env python3
"""Build complete terminology fallbacks from the supplied local releases."""
import csv
import json
import sys
from collections import defaultdict, Counter
from pathlib import Path
from xml.etree import ElementTree
from import_twb_bundle import load_glossary, convert

BASE = Path('/home/arvin/2TBstorage/gitarchive/databases/DEFINITIONS')
csv.field_size_limit(sys.maxsize)


def card(source, concept, term, synonyms, language='English'):
    return dict(source=source, concept_id=concept, language=language,
                original_phrase=term, possible_english_term=term,
                other_terms=synonyms, follow_up_questions_original=[],
                follow_up_questions=[], tags=[source + ' fallback'])


def snomed():
    concepts = {}
    descriptions = defaultdict(dict)
    for edition in ['snomed_ct_int', 'snomed_ct_us']:
        folder = BASE / edition / 'Snapshot' / 'Terminology'
        for path in sorted(folder.glob('sct2_Concept_Snapshot*.txt')):
            with path.open() as stream:
                for row in csv.DictReader(stream, delimiter='\t'):
                    old = concepts.get(row['id'])
                    if old is None or row['effectiveTime'] > old['effectiveTime']:
                        concepts[row['id']] = row
        for path in sorted(folder.glob('sct2_Description_Snapshot*.txt')):
            with path.open() as stream:
                for row in csv.DictReader(stream, delimiter='\t'):
                    old = descriptions[row['conceptId']].get(row['id'])
                    if old is None or row['effectiveTime'] > old['effectiveTime']:
                        descriptions[row['conceptId']][row['id']] = row
    for concept, rows in descriptions.items():
        if concepts.get(concept, {}).get('active') != '1':
            continue
        active = [r for r in rows.values() if r['active'] == '1']
        synonyms = list(dict.fromkeys(r['term'] for r in active if r['typeId'] == '900000000000013009'))
        names = [r['term'] for r in active if r['typeId'] == '900000000000003001']
        terms = list(dict.fromkeys(synonyms + names))
        if terms:
            yield card('SNOMED CT', concept, terms[0], terms[1:])


def mondo():
    path = BASE / 'mondo/2026-10-06/mondo.obo'
    english = {}
    for block in path.read_text().split('[Term]')[1:]:
        values = defaultdict(list)
        for line in block.splitlines():
            key, sep, value = line.partition(': ')
            if sep:
                values[key].append(value)
        if 'true' in values['is_obsolete'] or not values['id'] or not values['name']:
            continue
        synonyms = []
        for value in values['synonym']:
            decoder = json.JSONDecoder()
            term, end = decoder.raw_decode(value)
            if value[end:].lstrip().startswith('EXACT'):
                synonyms.append(term)
        english[values['id'][0]] = values['name'][0]
        yield card('MONDO', values['id'][0], values['name'][0], list(dict.fromkeys(synonyms)))
    international = path.with_name('mondo-international.owl')
    for event, element in ElementTree.iterparse(international, events=['end']):
        if element.tag != '{http://www.w3.org/2002/07/owl#}Class':
            continue
        uri = element.get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about', '')
        concept = uri.rsplit('/', 1)[-1].replace('MONDO_', 'MONDO:')
        if concept in english:
            for label in element.findall('{http://www.w3.org/2000/01/rdf-schema#}label'):
                language = label.get('{http://www.w3.org/XML/1998/namespace}lang')
                if language and language != 'en' and label.text:
                    row = card('MONDO', concept, label.text, [], language)
                    row['possible_english_term'] = english[concept]
                    yield row
        element.clear()


def main():
    records = convert(load_glossary('data/twb.js'))
    for row in records:
        row['tags'] = ['TWB fallback']
        row['follow_up_questions_original'] = []
    sources = [('twb', records), ('snomed', snomed()), ('mondo', mondo())]
    manifest = []
    counts = Counter()
    for name, rows in sources:
        batch = []
        index = 0
        for row in rows:
            batch.append(row)
            counts[name] += 1
            if len(batch) == 10000:
                filename = f'fallback-{name}-{index}.json'
                Path(filename).write_text(json.dumps(batch, ensure_ascii=False, separators=(',', ':')))
                manifest.append(filename)
                batch = []
                index += 1
        if batch:
            filename = f'fallback-{name}-{index}.json'
            Path(filename).write_text(json.dumps(batch, ensure_ascii=False, separators=(',', ':')))
            manifest.append(filename)
    Path('fallbacks.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(dict(counts))


if __name__ == '__main__':
    main()
