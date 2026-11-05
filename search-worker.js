// Keep terminology downloads, JSON parsing, and fuzzy indexing off the UI thread.
const normalize = value => value.trim().toLocaleLowerCase();
const names = new Intl.DisplayNames(['en'], { type: 'language' });
const codes = {
  English: 'en', Farsi: 'fa', Persian: 'fa', Punjabi: 'pa',
  Arabic_sa: 'ar', French_fr: 'fr', Spanish_es: 'es', Spanish_la: 'es',
  Portuguese_br: 'pt', Portuguese_pt: 'pt'
};
let loading;
let records;
let curated;
let fallbacks;
let languages;
let englishIndex;
let exactIndex;
let fuzzy;
const searchCache = new Map();

function languageMatches(value, query) {
  const code = codes[value] || value;
  const name = /^[a-z]{2,3}$/.test(code) ? names.of(code) : value.replaceAll('_', ' ');
  const aliases = [value, code, name];
  if (/^[a-z]{2,3}$/.test(code)) aliases.push(new Intl.DisplayNames([code], { type: 'language' }).of(code));
  if (name === 'Persian') aliases.push('Farsi', 'فارسی');
  return aliases.some(alias => normalize(alias) === query);
}

async function readJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}. Please try again.`);
  return response.json();
}

async function load() {
  loading ||= (async () => {
    curated = await readJSON('entries.json?v=4');
    const manifest = await readJSON('fallbacks.json');
    const sources = await Promise.all(manifest.map(async path => {
      const data = await readJSON(path);
      return Array.isArray(data) ? data : data.entries.map(entry => ({ ...data.defaults, ...entry }));
    }));
    fallbacks = [].concat(...sources);
    records = curated.concat(fallbacks);
    languages = [...new Set(records.map(entry => entry.language))];
    return records;
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}

function add(index, value, entry) {
  if (!value) return;
  const key = normalize(value);
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(entry);
}

function buildIndexes() {
  if (englishIndex) return;
  englishIndex = new Map();
  exactIndex = new Map();
  for (const entry of records) {
    const english = [entry.possible_english_term, ...entry.other_terms];
    if (entry.language === 'en' || entry.language === 'English') {
      english.push(entry.original_phrase, ...(entry.aliases || []));
    }
    for (const value of english) add(englishIndex, value, entry);
    if (entry.source !== 'MyHealthWord') {
      for (const value of [entry.original_phrase, ...(entry.aliases || []),
        entry.possible_english_term, ...entry.other_terms, entry.transliteration, entry.literal_translation]) {
        add(exactIndex, value, entry);
      }
    }
  }
}

function find(query) {
  const exact = exactIndex.get(normalize(query));
  if (exact) return [...exact];
  if (!fuzzy) {
    importScripts('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0');
    fuzzy = new Fuse(fallbacks, {
      keys: ['original_phrase', 'aliases', 'transliteration', 'literal_translation', 'possible_english_term', 'other_terms'],
      includeScore: true, threshold: 0.25, ignoreLocation: true
    });
  }
  return fuzzy.search(query).filter(result => result.score <= 0.25).map(result => result.item);
}

function search({ query, language, translationRequested }) {
  const cacheKey = JSON.stringify([normalize(query), normalize(language), translationRequested]);
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);
  buildIndexes();
  const english = englishIndex.get(normalize(query));
  const translated = Boolean(english);
  if (translated && (!translationRequested || !language.trim())) return { entries: [], translated };
  let candidates;
  if (translated) {
    const selected = normalize(language);
    const matching = new Set(languages.filter(value => languageMatches(value, selected)));
    matching.delete('English');
    matching.delete('en');
    const concepts = new Set([...english].filter(entry => entry.concept_id)
      .map(entry => `${entry.source}:${entry.concept_id}`));
    candidates = records.filter(entry => matching.has(entry.language)
      && (english.has(entry) || (entry.concept_id && concepts.has(`${entry.source}:${entry.concept_id}`))));
    const project = candidates.filter(entry => entry.source === 'MyHealthWord');
    if (project.length) candidates = project;
  } else {
    candidates = find(query);
  }
  const seen = new Set();
  candidates = candidates.filter(entry => {
    const key = JSON.stringify([entry.original_phrase, entry.possible_english_term, entry.plain_language_meaning]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const response = { entries: candidates.slice(0, 5), translated };
  searchCache.set(cacheKey, response);
  return response;
}

self.onmessage = async ({ data }) => {
  try {
    await load();
    let response;
    if (data.action === 'search') response = search(data);
    else if (data.action === 'browse') response = {
      entries: records.slice(data.offset, data.offset + 50),
      hasMore: data.offset + 50 < records.length
    };
    else if (data.action === 'lucky') response = { entries: [records[Math.floor(Math.random() * records.length)]] };
    else throw new Error('Unknown search action.');
    self.postMessage({ id: data.id, languages, ...response });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
