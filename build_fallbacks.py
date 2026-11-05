#!/usr/bin/env python3
"""Build complete terminology fallbacks from the supplied local releases."""
import json
import tarfile
import zipfile
from collections import defaultdict, Counter
from pathlib import Path
from xml.etree import ElementTree
from import_twb_bundle import load_glossary, convert

BASE = Path('/home/arvin/2TBstorage/gitarchive/databases/DEFINITIONS')
DOWNLOADS = Path('data/source_review')


def orphadata():
    editions = {}
    for path in sorted(DOWNLOADS.glob('*_product1.json.tar.gz')):
        with tarfile.open(path) as archive:
            member = next(m for m in archive.getmembers() if m.isfile() and m.name.endswith('.json'))
            package = json.load(archive.extractfile(member))['JDBOR'][0]
        editions[path.name[:2]] = package
    english = {r['OrphaCode']: r['Name'][0]['label'] for r in editions['en']['DisorderList'][0]['Disorder']}
    for language, package in editions.items():
        for item in package['DisorderList'][0]['Disorder']:
            term = item['Name'][0]['label']
            synonyms = [s['label'] for group in item.get('SynonymList', []) for s in group.get('Synonym', []) if s.get('label')]
            row = card('Orphadata', 'ORPHA:'+item['OrphaCode'], term, [], language)
            row['aliases'] = synonyms
            row['possible_english_term'] = english.get(item['OrphaCode'], '')
            row['source_url'] = 'https://www.orpha.net/en/disease/detail/'+item['OrphaCode']
            row['source_version'] = package['date']
            row['attribution'] = 'Orphadata Science: Free access data from Orphanet. © INSERM 1999. CC BY 4.0. Converted to search records.'
            yield row


def medlineplus():
    with zipfile.ZipFile(DOWNLOADS/'medlineplus.zip') as archive:
        name = next(n for n in archive.namelist() if n.endswith('.xml'))
        root = ElementTree.fromstring(archive.read(name))
    topics = {r.get('id'): r for r in root.findall('health-topic')}
    for item in topics.values():
        language = item.get('language')
        english = item if language == 'English' else None
        if english is None:
            for mapped in item.findall('language-mapped-topic'):
                if mapped.get('language') == 'English':
                    english = topics.get(mapped.get('id'))
                    break
        row = card('MedlinePlus', item.get('id'), item.get('title'), [], language)
        row['aliases'] = [a.text for a in item.findall('also-called') if a.text]
        row['possible_english_term'] = english.get('title') if english is not None else ''
        row['source_url'] = item.get('url')
        row['attribution'] = 'Information from MedlinePlus.gov, US National Library of Medicine. Converted to search records.'
        yield row


def card(source, concept, term, synonyms, language='English'):
    return dict(source=source, concept_id=concept, language=language,
                original_phrase=term, possible_english_term=term,
                other_terms=synonyms, follow_up_questions_original=[],
                follow_up_questions=[], tags=[source + ' fallback'])


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
    sources = [('twb', records), ('mondo', mondo()), ('orphadata', orphadata()), ('medlineplus', medlineplus())]
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
