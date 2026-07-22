const els = {
  form: document.querySelector('#searchForm'), input: document.querySelector('#wordInput'), status: document.querySelector('#status'), result: document.querySelector('#result'), title: document.querySelector('#wordTitle'), part: document.querySelector('#partOfSpeech'), phonetic: document.querySelector('#phonetic'), definitions: document.querySelector('#definitions'), example: document.querySelector('#example'), synonyms: document.querySelector('#synonyms'), etymology: document.querySelector('#etymology'), originSource: document.querySelector('#originSource'), sound: document.querySelector('#soundButton')
};
let audioUrl = '';
const cleanWord = value => String(value || '').trim().toLowerCase().replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ');
const stripWiki = value => {
  let text = String(value || '').replace(/<!--.*?-->/gs, '');
  for (let pass = 0; pass < 5 && /\{\{[^{}]*\}\}/.test(text); pass += 1) {
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, body) => {
      const parts = body.split('|');
      const name = parts.shift()?.trim().toLowerCase();
      if (['m', 'l', 'link'].includes(name)) return parts[1] || parts[0] || '';
      if (['der', 'inh', 'bor'].includes(name)) return parts[2] || parts[1] || '';
      if (['suf', 'prefix'].includes(name)) return parts.slice(1).filter(Boolean).join(' ');
      return '';
    });
  }
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1')
    .replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
};
const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const unique = values => [...new Set(values.filter(Boolean).map(value => value.trim()).filter(Boolean))];
function fallbackExample(word, partOfSpeech) {
  return 'No verified usage example was available for this word.';
}
function showDefinitions(data, extras = {}) {
  const meanings = data.flatMap(entry => entry.meanings || []);
  const partOfSpeech = unique(meanings.map(meaning => meaning.partOfSpeech))[0] || 'Word';
  els.part.textContent = partOfSpeech;
  els.definitions.innerHTML = meanings.slice(0, 4).map(meaning => (meaning.definitions || []).slice(0, 2).map(definition => `<p class="definition"><small>${escapeHtml(meaning.partOfSpeech || 'meaning')}</small>${escapeHtml(definition.definition)}</p>`).join('')).join('') || '<p class="definition">No definition found.</p>';
  const examples = unique(meanings.flatMap(meaning => (meaning.definitions || []).map(definition => definition.example)));
  els.example.textContent = examples[0] || extras.example || fallbackExample(els.title.textContent, partOfSpeech);
  const synonyms = unique(meanings.flatMap(meaning => [...(meaning.synonyms || []), ...(meaning.definitions || []).flatMap(definition => definition.synonyms || [])]).concat(extras.synonyms || [])).slice(0, 12);
  els.synonyms.innerHTML = synonyms.length ? synonyms.map(word => `<span class="chip">${escapeHtml(word)}</span>`).join('') : '<span class="definition">No close companions listed yet.</span>';
  const phonetic = data.find(entry => entry.phonetic)?.phonetic || data.flatMap(entry => entry.phonetics || []).find(item => item.text)?.text;
  els.phonetic.textContent = phonetic || '';
  audioUrl = data.flatMap(entry => entry.phonetics || []).find(item => item.audio)?.audio || '';
  els.sound.hidden = !audioUrl;
}
async function fetchWiktionaryEntry(word) {
  const response = await fetch(`https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&origin=*`);
  if (!response.ok) throw new Error('Wiktionary unavailable');
  return (await response.json()).parse?.wikitext?.['*'] || '';
}
async function fetchWiktionaryDefinitions(word) {
  const response = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
  if (!response.ok) throw new Error('Wiktionary definitions unavailable');
  return await response.json();
}
async function fetchWiktionaryHtml(word) {
  const response = await fetch(`https://en.wiktionary.org/api/rest_v1/page/html/${encodeURIComponent(word)}`);
  if (!response.ok) throw new Error('Wiktionary page unavailable');
  return await response.text();
}
function etymologySection(text) {
  return String(text || '').match(/(?:^|\n)===\s*Etymology(?:\s+\d+)?\s*===\s*\n([\s\S]*?)(?=\n===|\n==|$)/i)?.[1] || '';
}
function wiktionaryExample(text) {
  const raw = String(text || '');
  const passage = raw.match(/\|passage\s*=\s*([^{}\n]+(?:\n(?!\|)[^{}\n]+)*)/i)?.[1];
  const usage = raw.match(/\{\{(?:ux|usex)\|[^|}]*\|([^|}]+)[^}]*\}\}/i)?.[1];
  const bullet = raw.split('\n').find(line => /^#\*\s*/.test(line) && !line.includes('{{quote-book'));
  return stripWiki(passage || usage || bullet?.replace(/^#\*\s*/, '') || '');
}
function structuredExamples(data) {
  return unique((data?.en || [])
    .filter(entry => entry.language === 'English')
    .flatMap(entry => entry.definitions || [])
    .flatMap(definition => definition.examples || definition.parsedExamples?.map(item => item.example) || [])
    .map(example => String(example).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')));
}
function renderedEtymology(html) {
  if (!html || typeof DOMParser === 'undefined') return '';
  const document = new DOMParser().parseFromString(html, 'text/html');
  const heading = [...document.querySelectorAll('h2, h3, h4')].find(node => /^etymology(?:\s+\d+)?$/i.test(node.textContent.trim()));
  if (!heading) return '';
  const parts = [];
  for (let node = heading.nextElementSibling; node && !/^h[1-4]$/i.test(node.tagName); node = node.nextElementSibling) {
    if (/^(STYLE|SCRIPT|NOSCRIPT)$/i.test(node.tagName)) continue;
    const value = node.textContent.replace(/\s+/g, ' ').trim();
    if (value) parts.push(value);
  }
  return parts.join(' ');
}
async function fetchEtymology(word, wikitext, pageHtml = '') {
  els.etymology.textContent = 'Looking into its history…';
  els.originSource.href = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  try {
    const text = wikitext || (pageHtml ? '' : await fetchWiktionaryEntry(word));
    const section = etymologySection(text) || renderedEtymology(pageHtml);
    els.etymology.textContent = section ? stripWiki(section) : 'The available entry does not include an etymology yet.';
  } catch { els.etymology.textContent = 'Word history is taking the scenic route. Open the source to explore it.'; }
}
async function fetchSynonyms(word) {
  try {
    const response = await fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=12`);
    if (!response.ok) return [];
    return (await response.json()).map(item => item.word);
  } catch { return []; }
}
function withTimeout(promise, milliseconds = 4500) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('optional request timed out')), milliseconds))]);
}
function showEnrichmentExample(example) {
  if (example && els.example.textContent.startsWith('No verified usage')) els.example.textContent = example;
}
function showEnrichmentSynonyms(synonyms) {
  const values = unique(synonyms || []).slice(0, 12);
  els.synonyms.innerHTML = values.length ? values.map(word => `<span class="chip">${escapeHtml(word)}</span>`).join('') : '<span class="definition">No close companions listed yet.</span>';
}
async function lookup(value) {
  const word = cleanWord(value); if (!word) return;
  const lookupId = (lookup.latest = (lookup.latest || 0) + 1);
  els.input.value = word; els.status.textContent = 'Turning the page…'; els.result.hidden = true;
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error('not found');
    const data = await response.json();
    if (lookupId !== lookup.latest) return;
    els.title.textContent = data[0]?.word || word; showDefinitions(data); els.result.hidden = false; els.status.textContent = 'Adding examples, companions, and word history…';
    history.replaceState(null, '', `?word=${encodeURIComponent(word)}`);
    withTimeout(fetchWiktionaryDefinitions(word)).then(wiktionary => {
      if (lookupId !== lookup.latest) return;
      showEnrichmentExample(structuredExamples(wiktionary)[0]);
    }).catch(() => {});
    withTimeout(fetchSynonyms(word)).then(relatedWords => {
      if (lookupId !== lookup.latest) return;
      showEnrichmentSynonyms(relatedWords);
    }).catch(() => {});
    Promise.allSettled([withTimeout(fetchWiktionaryEntry(word)), withTimeout(fetchWiktionaryHtml(word))]).then(([wikitext, pageHtml]) => {
      if (lookupId !== lookup.latest) return;
      if (wikitext.status === 'fulfilled') showEnrichmentExample(wiktionaryExample(wikitext.value));
      fetchEtymology(word, wikitext.status === 'fulfilled' ? wikitext.value : '', pageHtml.status === 'fulfilled' ? pageHtml.value : '');
    });
    setTimeout(() => { if (lookupId === lookup.latest) els.status.textContent = ''; }, 4800);
  } catch { if (lookupId === lookup.latest) els.status.textContent = `No entry found for “${word}”. Try another word.`; }
}
els.form.addEventListener('submit', event => { event.preventDefault(); lookup(els.input.value); });
document.querySelectorAll('[data-word]').forEach(button => button.addEventListener('click', () => lookup(button.dataset.word)));
els.sound.addEventListener('click', () => { if (audioUrl) new Audio(audioUrl).play(); });
const initialWord = new URLSearchParams(location.search).get('word');
lookup(initialWord || 'resilient');
