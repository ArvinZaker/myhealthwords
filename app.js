const results = document.querySelector('#results');
const form = document.querySelector('#search-form');
const input = document.querySelector('#search-input');

let database;
async function loadEntries() {
  if (database) return database;
  const response = await fetch('entries.json?v=4', { cache: 'no-store' });
  const curated = await response.json();
  const manifest = await fetch('fallbacks.json', { cache: 'no-store' }).then(response => response.json());
  const fallbacks = await Promise.all(manifest.map(path => fetch(path).then(response => response.json())));
  database = curated.concat(...fallbacks);
  return database;
}

function showCard(entry) {
  const otherTerms = entry.other_terms.map((term) => `<li>${term}</li>`).join('');
  const tags = (entry.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join('');
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
      <h2 class="term" dir="auto">${entry.original_phrase}</h2>
      <div class="tags">${tags}</div>
      <h3>Possible English term</h3>
      <p class="english-term" dir="auto">${entry.possible_english_term}</p>
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
    results.insertAdjacentHTML('beforeend', entries.slice(offset, offset + 50).map(showCard).join(''));
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  const entries = await loadEntries();
  if (!entries.length) {
    results.innerHTML = '';
    return;
  }

  const normalize = (value) => value.trim().toLocaleLowerCase();
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
  const curatedMatches = findMatches(entries.filter(entry => entry.source === 'MyHealthWord'));
  const candidates = curatedMatches.length
    ? curatedMatches
    : findMatches(entries.filter(entry => entry.source !== 'MyHealthWord'));
  const matches = candidates
    .filter((item, index, items) => items.findIndex((candidate) => (
      candidate.original_phrase === item.original_phrase
      && candidate.possible_english_term === item.possible_english_term
      && candidate.plain_language_meaning === item.plain_language_meaning
    )) === index)
    .slice(0, 5);
  results.innerHTML = matches.length
    ? matches.map(showCard).join('')
    : '<p class="no-results">No matching symptom was found.</p>';
});
