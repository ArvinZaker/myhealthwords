#!/usr/bin/env python3
"""Download candidate terminology sources and inventory them without publishing."""
import hashlib
import json
import re
import tarfile
import zipfile
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

DEST = Path('data/source_review')
DEST.mkdir(parents=True, exist_ok=True)
manifest = []


def fetch(url, name):
    path = DEST / name
    try:
        if not path.exists():
            with urlopen(Request(url, headers={'User-Agent': 'MyHealthWord-source-assessment'}), timeout=90) as response:
                data = response.read()
            path.write_bytes(data)
        data = path.read_bytes()
        manifest.append(dict(url=url, file=str(path), bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
        print('Downloaded', name, len(data), flush=True)
        return path
    except Exception as error:
        manifest.append(dict(url=url, error=str(error)))
        print('FAILED', url, str(error), flush=True)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.links.extend(value for key, value in attrs if key == 'href')


def links(path, base):
    parser = Links()
    parser.feed(path.read_text())
    return sorted(set(urljoin(base, url) for url in parser.links))


def download():
    fetch('https://purl.obolibrary.org/obo/hp/hp-international.owl', 'hp-international.owl')
    fetch('https://raw.githubusercontent.com/obophenotype/human-phenotype-ontology/master/LICENSE.md', 'hpo-license.txt')
    page = 'https://www.orphadata.com/_alignments/'
    path = fetch(page, 'orphadata.html')
    if path:
        for url in links(path, page):
            if re.search(r'/[a-z]{2}_product1\.json\.tar\.gz$', url):
                fetch(url, url.rsplit('/', 1)[-1])
    page = 'https://medlineplus.gov/xml.html'
    path = fetch(page, 'medlineplus.html')
    if path:
        urls = [u for u in links(path, page) if re.search(r'mplus_topics_compressed_.*\.zip$', u)]
        if urls:
            fetch(max(urls), 'medlineplus.zip')
    page = 'https://www.mhcs.health.nsw.gov.au/glossary/covid-19-glossary'
    path = fetch(page, 'nsw.html')
    if path:
        for url in links(path, page):
            if '.pdf' in url.lower():
                name = url.split('.pdf')[0].rsplit('/', 1)[-1] + '.pdf'
                fetch(url, 'nsw-' + name)
    fetch('https://www.mhcs.health.nsw.gov.au/about-us/copyright-and-disclaimer', 'nsw-copyright.html')
    for language, filename in [('fa', 'farsi.pdf'), ('pa', 'punjabi-covid-glossary.pdf')]:
        fetch('https://www.mhcs.health.nsw.gov.au/publications/glossaries/' + filename + '/@@download/file', 'nsw-' + language + '.pdf')
    (DEST / 'manifest.json').write_text(json.dumps(manifest, indent=2))


def inventory():
    normalize = lambda value: ' '.join(value.casefold().split())
    languages = {'English': 'en', 'Farsi': 'fa', 'Persian': 'fa', 'Punjabi': 'pa', 'Arabic_sa': 'ar', 'French_fr': 'fr', 'Spanish_es': 'es', 'Spanish_latam': 'es'}
    languages.update({'Czech':'cs','German':'de','Dutch':'nl','Italian':'it','Japanese':'ja','Turkish':'tr','Portuguese_br':'pt','Portuguese_pt':'pt','Spanish_la':'es','Chinese_simplified':'zh','Chinese_traditional':'zh','Russian':'ru'})
    existing = set()
    for path in ['entries.json'] + json.loads(Path('fallbacks.json').read_text()):
        for row in json.loads(Path(path).read_text()):
            lang = languages.get(row['language'], row['language'])
            for term in [row['original_phrase']] + row.get('aliases', []):
                existing.add((lang, normalize(term)))
            for term in [row['possible_english_term']] + row.get('other_terms', []):
                existing.add(('en', normalize(term)))
    summary = {}
    owl = DEST / 'hp-international.owl'
    counts, terms, provenance = Counter(), set(), Counter()
    for event, element in ET.iterparse(owl, events=['end']):
        if element.tag != '{http://www.w3.org/2002/07/owl#}Class':
            continue
        uri = element.get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about', '')
        if '/HP_' in uri:
            if any(child.tag.endswith('deprecated') and child.text == 'true' for child in element):
                element.clear()
                continue
            counts['concepts'] += 1
            for child in element:
                kind = child.tag.rsplit('}', 1)[-1]
                if kind in ['label', 'hasExactSynonym'] and child.text:
                    lang = child.get('{http://www.w3.org/XML/1998/namespace}lang', 'en')
                    terms.add((lang, normalize(child.text)))
                    counts[lang] += 1
        element.clear()
    summary['HPO'] = dict(counts=dict(counts), unique_terms=len(terms), new_exact_phrases=len(terms-existing), languages=sorted({t[0] for t in terms}))
    orpha = {}
    for path in sorted(DEST.glob('*_product1.json.tar.gz')):
        lang = path.name[:2]
        with tarfile.open(path) as archive:
            member = next(m for m in archive.getmembers() if m.isfile() and m.name.endswith('.json'))
            data = json.load(archive.extractfile(member))
        rows = data['JDBOR'][0]['DisorderList'][0]['Disorder']
        terms = set()
        for row in rows:
            for name in row.get('Name', []):
                if name.get('label'):
                    terms.add((name.get('lang', lang), normalize(name['label'])))
            for group in row.get('SynonymList', []):
                for synonym in group.get('Synonym', []):
                    if synonym.get('label'):
                        terms.add((synonym.get('lang', lang), normalize(synonym['label'])))
        orpha[lang] = dict(records=len(rows), unique_terms=len(terms), new_exact_phrases=len(terms-existing))
    summary['Orphadata'] = orpha
    with zipfile.ZipFile(DEST/'medlineplus.zip') as archive:
        name = next(n for n in archive.namelist() if n.endswith('.xml'))
        root = ET.fromstring(archive.read(name))
    counts, terms = Counter(), set()
    for row in root.iter('health-topic'):
        lang = {'English':'en','Spanish':'es'}.get(row.get('language'), row.get('language'))
        counts[lang] += 1
        terms.add((lang, normalize(row.get('title', ''))))
        for child in row.findall('also-called'):
            if child.text:
                terms.add((lang, normalize(child.text)))
    summary['MedlinePlus'] = dict(records=dict(counts), unique_terms=len(terms), new_exact_phrases=len(terms-existing))
    nsw = {}
    for language in ['fa', 'pa']:
        path = DEST / ('nsw-' + language + '.pdf')
        xml = subprocess.check_output(['pdftohtml','-xml','-stdout','-i',str(path)])
        # Poppler can prepend informational text before the XML header.
        root = ET.fromstring(xml[xml.index(b'<?xml'):])
        headings = []
        for page in root.findall('page'):
            if int(page.get('number')) < 4:
                continue
            previous_top = -100
            for text in page.findall('text'):
                value = ''.join(text.itertext()).strip()
                if float(text.get('left')) < 450 and text.find('b') is not None and re.search('[A-Za-z]{2}',value):
                    top = float(text.get('top'))
                    if headings and top-previous_top < 30 and top > previous_top:
                        headings[-1] += ' ' + value
                    else:
                        headings.append(value)
                    previous_top = top
        nsw[language] = dict(pages=len(root.findall('page')), candidate_english_headings=len(headings), heading_list=headings,
                            note='PDF heading extraction only; bilingual term alignment and script accuracy need visual review before import.')
    summary['NSW'] = nsw
    (DEST/'coverage.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    import sys
    if '--inventory' in sys.argv:
        inventory()
    else:
        download()
