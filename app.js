const results = document.querySelector('#results');
const form = document.querySelector('#search-form');
const input = document.querySelector('#search-input');
const languagePicker = document.querySelector('#language-picker');
const languageInput = document.querySelector('#target-language');
const languageOptions = document.querySelector('#language-options');
const normalize = value => value.trim().toLocaleLowerCase();
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const languageLabels = new Map();
const languageCodes = {
  English: 'en', Farsi: 'fa', Persian: 'fa', Punjabi: 'pa',
  Arabic_sa: 'ar', French_fr: 'fr', Spanish_es: 'es', Spanish_la: 'es',
  Portuguese_br: 'pt', Portuguese_pt: 'pt'
};

function languageName(value) {
  if (languageLabels.has(value)) return languageLabels.get(value);
  const code = languageCodes[value] || value;
  const name = /^[a-z]{2,3}$/.test(code) ? languageNames.of(code) : value.replaceAll('_', ' ');
  languageLabels.set(value, name);
  return name;
}

function languageAliases(value) {
  const name = languageName(value);
  const code = languageCodes[value] || value;
  const aliases = [value, name, code];
  if (/^[a-z]{2,3}$/.test(code)) {
    aliases.push(new Intl.DisplayNames([code], { type: 'language' }).of(code));
  }
  if (name === 'Persian') aliases.push('Farsi', 'فارسی');
  return aliases.map(normalize);
}

input.addEventListener('input', () => {
  languagePicker.hidden = true;
  results.innerHTML = '';
});

languageInput.addEventListener('input', () => {
  results.innerHTML = '';
});

document.querySelector('#translate-button').addEventListener('click', event => search(event, true));
languageInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') search(event, true);
});

let database;
let curatedLoad;
async function loadEntries() {
  if (database) return database;
  curatedLoad ||= fetch('entries.json?v=4').then(response => {
    if (!response.ok) throw new Error('Could not load project entries.');
    return response.json();
  }).catch(error => { curatedLoad = undefined; throw error; });
  database = await curatedLoad;
  const catalogue = await fetch('catalogue.json', {cache: 'no-cache'}).then(response => {
    if (!response.ok) throw new Error('Could not load available languages.');
    return response.json();
  });
  updateLanguages(database.map(entry => entry.language).concat(catalogue.flatMap(source => source.languages)));
  return database;
}

function updateLanguages(available) {
  const languages = [...new Set(available)]
    .filter(language => languageName(language) !== 'English');
  const suggestions = [...new Set(languages.flatMap(language =>
    [languageName(language), ...languageAliases(language)]))].sort();
  languageOptions.replaceChildren(...suggestions.map(name => {
    const option = document.createElement('option');
    option.value = name;
    return option;
  }));
}

let fallbackWorker;
let requestNumber = 0;
let revision = 0;
const requests = new Map();

input.addEventListener('input', () => { revision += 1; });
languageInput.addEventListener('input', () => { revision += 1; });

function fallbackRequest(action, options = {}) {
  if (!fallbackWorker) {
    fallbackWorker = new Worker('search-worker.js?v=3');
    fallbackWorker.onmessage = ({ data }) => {
      const request = requests.get(data.id);
      if (!request) return;
      requests.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data);
    };
    fallbackWorker.onerror = () => {
      for (const request of requests.values()) request.reject(new Error('Fallback search could not start. Please try again.'));
      requests.clear();
      fallbackWorker.terminate();
      fallbackWorker = undefined;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++requestNumber;
    requests.set(id, { resolve, reject });
    fallbackWorker.postMessage({ id, action, ...options });
  });
}

async function runFallback(action, options = {}) {
  const currentRevision = ++revision;
  results.innerHTML = '<p role="status">Searching terminology databases…</p>';
  try {
    const response = await fallbackRequest(action, options);
    if (currentRevision !== revision) return;
    updateLanguages(response.languages);
    return response;
  } catch (error) {
    if (currentRevision === revision) results.textContent = error.message;
  }
}

function showCard(entry, translated = false) {
  const escape = value => String(value || '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  entry = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key,
    Array.isArray(value) ? value.map(escape) : escape(value)
  ]));
  const otherTerms = entry.other_terms.map((term) => `<li>${term}</li>`).join('');
  const tags = (entry.tags || []).map((tag) => entry.source_url
    ? `<a class="tag" href="${entry.source_url}" target="_blank" rel="noopener" title="${entry.attribution || entry.source}">${tag}</a>`
    : `<span class="tag">${tag}</span>`).join('');
  const originalQuestions = entry.follow_up_questions_original || [];
  const englishQuestions = entry.follow_up_questions || [];
  const questionCount = Math.max(originalQuestions.length, englishQuestions.length);
  const questionRows = Array.from({ length: questionCount }, (_, index) => `
    <div class="question-row">
      <strong>Q${index + 1}</strong>
      <div class="question-original" dir="auto">${originalQuestions[index] || ''}</div>
      <div class="question-english">${englishQuestions[index] || ''}</div>
    </div>`).join('');

  return `
    <article class="card">
      <h2 class="term" dir="auto">${translated ? entry.possible_english_term : entry.original_phrase}</h2>
      <div class="tags">${tags}</div>
      <h3>${translated ? 'Possible translation' : 'Possible English term'}</h3>
      <p class="english-term" dir="auto">${translated ? entry.original_phrase : entry.possible_english_term}</p>
      <h3>Other possible terms</h3>
      <ul class="card-list">${otherTerms}</ul>
      <h3>Follow-up questions</h3>
      <div class="question-box">
        ${questionRows}
      </div>
    </article>`;
}

function renderEntries(entries) {
  results.innerHTML = '';
  let offset = 0;
  const more = document.createElement('button');
  more.textContent = 'Show more';
  function append() {
    more.remove();
    results.insertAdjacentHTML('beforeend', entries.slice(offset, offset + 50).map(entry => showCard(entry)).join(''));
    offset += 50;
    if (offset < entries.length) results.append(more);
  }
  more.addEventListener('click', append);
  append();
}

document.querySelector('#browse-all').addEventListener('click', async () => {
  revision += 1;
  const entries = await loadEntries();
  renderEntries(entries);
  const more = document.createElement('button');
  more.textContent = 'Browse fallback databases';
  more.addEventListener('click', () => browseFallbacks());
  results.append(more);
});

document.querySelector('#feeling-lucky').addEventListener('click', async () => {
  const response = await runFallback('lucky');
  if (response) results.innerHTML = response.entries.map(entry => showCard(entry)).join('');
});

async function browseFallbacks(offset = 0) {
  const response = await runFallback('browse', { offset });
  if (!response) return;
  results.innerHTML = response.entries.map(entry => showCard(entry)).join('');
  if (response.hasMore) {
    const more = document.createElement('button');
    more.textContent = 'Show more';
    more.addEventListener('click', () => browseFallbacks(offset + response.entries.length));
    results.append(more);
  }
}

async function searchFallbacks(query, translationRequested) {
  const response = await runFallback('search', { query, translationRequested, language: languageInput.value });
  if (!response) return;
  languagePicker.hidden = !response.translated;
  if (response.translated && (!translationRequested || !languageInput.value.trim())) {
    results.innerHTML = '';
    languageInput.focus();
  } else {
    results.innerHTML = response.entries.length
      ? response.entries.map(entry => showCard(entry, response.translated)).join('')
      : '<p class="no-results">No matching translation or symptom was found.</p>';
  }
}

async function search(event, translationRequested = false) {
  event.preventDefault();
  const searchRevision = ++revision;
  const query = input.value.trim();
  if (!query) return;

  const entries = await loadEntries();
  if (searchRevision !== revision) return;
  if (!entries.length) {
    results.innerHTML = '';
    return;
  }

  const normalizedQuery = normalize(query);
  function findMatches(records) {
  const exactMatches = records.filter((entry) => [
    entry.original_phrase,
    ...(entry.aliases || []),
    entry.possible_english_term,
    ...entry.other_terms,
    entry.transliteration,
    entry.literal_translation
  ].some((value) => value && normalize(value) === normalizedQuery));
  if (exactMatches.length) return exactMatches;
  const fuse = new Fuse(records, {
    keys: ['original_phrase', 'aliases', 'transliteration', 'literal_translation', 'possible_english_term', 'other_terms'],
    includeScore: true,
    threshold: 0.25,
    ignoreLocation: true
  });
  return fuse.search(query)
    .filter(({ score }) => score <= 0.25)
    .map(({ item }) => item);
  }
  const englishMatches = entries.filter(entry => [
    entry.possible_english_term,
    ...(entry.other_terms || []),
    ...(languageName(entry.language) === 'English'
      ? [entry.original_phrase, ...(entry.aliases || [])] : [])
  ].some(value => value && normalize(value) === normalizedQuery));
  const translated = englishMatches.length > 0;
  let searchable = entries;
  if (translated) {
    languagePicker.hidden = false;
    if (!translationRequested || !languageInput.value.trim()) {
      results.innerHTML = '';
      languageInput.focus();
      return;
    }
    const selected = normalize(languageInput.value);
    const matchingLanguages = new Set([...new Set(entries.map(entry => entry.language))]
      .filter(language => languageAliases(language).includes(selected)));
    if (!matchingLanguages.size || [...matchingLanguages].every(language => languageName(language) === 'English')) {
      return searchFallbacks(query, translationRequested);
    }
    const concepts = new Set(englishMatches.filter(entry => entry.concept_id)
      .map(entry => `${entry.source}:${entry.concept_id}`));
    const englishEntries = new Set(englishMatches);
    searchable = entries.filter(entry => matchingLanguages.has(entry.language)
      && (englishEntries.has(entry)
        || (entry.concept_id && concepts.has(`${entry.source}:${entry.concept_id}`))));
  } else {
    languagePicker.hidden = true;
  }
  const curatedMatches = translated
    ? searchable.filter(entry => entry.source === 'MyHealthWord')
    : findMatches(searchable.filter(entry => entry.source === 'MyHealthWord'));
  const candidates = curatedMatches.length
    ? curatedMatches
    : translated ? searchable.filter(entry => entry.source !== 'MyHealthWord')
      : findMatches(searchable.filter(entry => entry.source !== 'MyHealthWord'));
  if (!candidates.length) return searchFallbacks(query, translationRequested);
  const matches = candidates
    .filter((item, index, items) => items.findIndex((candidate) => (
      candidate.original_phrase === item.original_phrase
      && candidate.possible_english_term === item.possible_english_term
      && candidate.plain_language_meaning === item.plain_language_meaning
    )) === index)
    .slice(0, 5);
  results.innerHTML = matches.length
    ? matches.map(entry => showCard(entry, translated)).join('')
    : `<p class="no-results">${translated ? 'No translation for this term is available in that language.' : 'No matching symptom was found.'}</p>`;
}

form.addEventListener('submit', event => search(event));
