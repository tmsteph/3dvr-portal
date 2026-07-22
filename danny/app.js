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
      if (['suf', 'prefix'].includes(name)) return parts[1] || '';
      return '';
    });
  }
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1')
    .replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
};
const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const unique = values => [...new Set(values.filter(Boolean).map(value => value.trim()).filter(Boolean))];
function showDefinitions(data, extras = {}) {
  const meanings = data.flatMap(entry => entry.meanings || []);
  els.part.textContent = unique(meanings.map(meaning => meaning.partOfSpeech))[0] || 'Word';
  els.definitions.innerHTML = meanings.slice(0, 4).map(meaning => (meaning.definitions || []).slice(0, 2).map(definition => `<p class="definition"><small>${escapeHtml(meaning.partOfSpeech || 'meaning')}</small>${escapeHtml(definition.definition)}</p>`).join('')).join('') || '<p class="definition">No definition found.</p>';
  const examples = unique(meanings.flatMap(meaning => (meaning.definitions || []).map(definition => definition.example)));
  els.example.textContent = examples[0] || extras.example || 'No usage example was included in the dictionary entry yet.';
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
async function fetchEtymology(word, wikitext) {
  els.etymology.textContent = 'Looking into its history…';
  els.originSource.href = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  try {
    const text = wikitext || await fetchWiktionaryEntry(word);
    const section = etymologySection(text);
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
async function lookup(value) {
  const word = cleanWord(value); if (!word) return;
  els.input.value = word; els.status.textContent = 'Turning the page…'; els.result.hidden = true;
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error('not found');
    const data = await response.json();
    const meanings = data.flatMap(entry => entry.meanings || []);
    const apiSynonyms = unique(meanings.flatMap(meaning => [...(meaning.synonyms || []), ...(meaning.definitions || []).flatMap(definition => definition.synonyms || [])]));
    const wikitext = await fetchWiktionaryEntry(word).catch(() => '');
    const extras = { synonyms: apiSynonyms.length ? [] : await fetchSynonyms(word), example: wiktionaryExample(wikitext) };
    els.title.textContent = data[0]?.word || word; showDefinitions(data, extras); els.result.hidden = false; els.status.textContent = ''; fetchEtymology(word, wikitext);
    history.replaceState(null, '', `?word=${encodeURIComponent(word)}`);
  } catch { els.status.textContent = `No entry found for “${word}”. Try another word.`; }
}
els.form.addEventListener('submit', event => { event.preventDefault(); lookup(els.input.value); });
document.querySelectorAll('[data-word]').forEach(button => button.addEventListener('click', () => lookup(button.dataset.word)));
els.sound.addEventListener('click', () => { if (audioUrl) new Audio(audioUrl).play(); });
const initialWord = new URLSearchParams(location.search).get('word');
lookup(initialWord || 'resilient');
