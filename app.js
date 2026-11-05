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
async function loadEntries() {
  if (database) return database;
  const response = await fetch('entries.json?v=4', { cache: 'no-store' });
  const curated = await response.json();
  const manifest = await fetch('fallbacks.json', { cache: 'no-store' }).then(response => response.json());
  const fallbacks = await Promise.all(manifest.map(async path => {
    const data = await fetch(path).then(response => response.json());
    return Array.isArray(data) ? data : data.entries.map(entry => ({ ...data.defaults, ...entry }));
  }));
  database = curated.concat(...fallbacks);
  const languages = [...new Set(database.map(entry => entry.language))]
    .filter(language => languageName(language) !== 'English');
  const suggestions = [...new Set(languages.flatMap(language =>
    [languageName(language), ...languageAliases(language)]))].sort();
  languageOptions.replaceChildren(...suggestions.map(name => {
    const option = document.createElement('option');
    option.value = name;
    return option;
  }));
  return database;
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
  const entries = await loadEntries();
  renderEntries(entries);
});

document.querySelector('#feeling-lucky').addEventListener('click', async () => {
  const entries = await loadEntries();
  results.innerHTML = entries.length
    ? showCard(entries[Math.floor(Math.random() * entries.length)])
    : '';
});

async function search(event, translationRequested = false) {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  const entries = await loadEntries();
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
      results.innerHTML = '<p class="no-results">No translations are available for that language. Choose a suggested language.</p>';
      return;
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
