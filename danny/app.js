const els = {
  form: document.querySelector('#searchForm'), input: document.querySelector('#wordInput'), status: document.querySelector('#status'), result: document.querySelector('#result'), title: document.querySelector('#wordTitle'), part: document.querySelector('#partOfSpeech'), phonetic: document.querySelector('#phonetic'), definitions: document.querySelector('#definitions'), example: document.querySelector('#example'), synonyms: document.querySelector('#synonyms'), etymology: document.querySelector('#etymology'), originSource: document.querySelector('#originSource'), sound: document.querySelector('#soundButton')
};
let audioUrl = '';
const cleanWord = value => String(value || '').trim().toLowerCase().replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ');
const stripWiki = value => String(value || '').replace(/<!--.*?-->/gs, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1').replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const unique = values => [...new Set(values.filter(Boolean).map(value => value.trim()).filter(Boolean))];
function showDefinitions(data) {
  const meanings = data.flatMap(entry => entry.meanings || []);
  els.part.textContent = unique(meanings.map(meaning => meaning.partOfSpeech))[0] || 'Word';
  els.definitions.innerHTML = meanings.slice(0, 4).map(meaning => (meaning.definitions || []).slice(0, 2).map(definition => `<p class="definition"><small>${escapeHtml(meaning.partOfSpeech || 'meaning')}</small>${escapeHtml(definition.definition)}</p>`).join('')).join('') || '<p class="definition">No definition found.</p>';
  const examples = meanings.flatMap(meaning => (meaning.definitions || []).map(definition => definition.example)).filter(Boolean);
  els.example.textContent = examples[0] || 'This word is waiting for a sentence of its own.';
  const synonyms = unique(meanings.flatMap(meaning => [...(meaning.synonyms || []), ...(meaning.definitions || []).flatMap(definition => definition.synonyms || [])])).slice(0, 12);
  els.synonyms.innerHTML = synonyms.length ? synonyms.map(word => `<span class="chip">${escapeHtml(word)}</span>`).join('') : '<span class="definition">No close companions listed yet.</span>';
  const phonetic = data.find(entry => entry.phonetic)?.phonetic || data.flatMap(entry => entry.phonetics || []).find(item => item.text)?.text;
  els.phonetic.textContent = phonetic || '';
  audioUrl = data.flatMap(entry => entry.phonetics || []).find(item => item.audio)?.audio || '';
  els.sound.hidden = !audioUrl;
}
async function fetchEtymology(word) {
  els.etymology.textContent = 'Looking into its history…';
  els.originSource.href = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  try {
    const response = await fetch(`https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&origin=*`);
    if (!response.ok) throw new Error('origin unavailable');
    const text = (await response.json()).parse?.wikitext?.['*'] || '';
    const match = text.match(/===Etymology(?:\s*\d+)?===([\s\S]*?)(?=\n===|\n==|$)/i);
    els.etymology.textContent = match ? stripWiki(match[1]) : 'The available entry does not include an etymology yet.';
  } catch { els.etymology.textContent = 'Word history is taking the scenic route. Open the source to explore it.'; }
}
async function lookup(value) {
  const word = cleanWord(value); if (!word) return;
  els.input.value = word; els.status.textContent = 'Turning the page…'; els.result.hidden = true;
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error('not found');
    const data = await response.json(); els.title.textContent = data[0]?.word || word; showDefinitions(data); els.result.hidden = false; els.status.textContent = ''; fetchEtymology(word);
    history.replaceState(null, '', `?word=${encodeURIComponent(word)}`);
  } catch { els.status.textContent = `No entry found for “${word}”. Try another word.`; }
}
els.form.addEventListener('submit', event => { event.preventDefault(); lookup(els.input.value); });
document.querySelectorAll('[data-word]').forEach(button => button.addEventListener('click', () => lookup(button.dataset.word)));
els.sound.addEventListener('click', () => { if (audioUrl) new Audio(audioUrl).play(); });
const initialWord = new URLSearchParams(location.search).get('word');
lookup(initialWord || 'resilient');
