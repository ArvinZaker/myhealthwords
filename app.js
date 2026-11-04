const results = document.querySelector('#results');
const form = document.querySelector('#search-form');
const input = document.querySelector('#search-input');

async function loadEntries() {
  const response = await fetch('entries.json?v=4', { cache: 'no-store' });
  return response.json();
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

document.querySelector('#browse-all').addEventListener('click', async () => {
  const entries = await loadEntries();
  results.innerHTML = entries.map(showCard).join('');
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
  const exactMatches = entries.filter((entry) => [
    entry.original_phrase,
    entry.transliteration,
    entry.literal_translation
  ].some((value) => value && normalize(value) === normalizedQuery));
  const fuse = new Fuse(entries, {
    keys: ['original_phrase', 'transliteration', 'literal_translation', 'possible_english_term', 'other_terms'],
    includeScore: true,
    threshold: 0.25,
    ignoreLocation: true
  });
  const matches = (exactMatches.length ? exactMatches : fuse.search(query)
    .filter(({ score }) => score <= 0.25)
    .map(({ item }) => item))
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
