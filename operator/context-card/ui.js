import { fields, storageKey, formatCard, proposeSummary, saveReviewed } from './model.js';

const $ = id => document.getElementById(id);
let previous = null;
let saved = '';
let available = true;
function showSaved(record) {
  const card = record ? JSON.parse(record) : null;
  saved = card?.text || '';
  $('saved').textContent = saved || 'No saved card yet.';
  $('updated').textContent = card ? `Last saved: ${card.updated}` : '';
}
try {
  previous = localStorage.getItem(storageKey);
  showSaved(previous);
} catch {
  available = false;
  $('status').textContent = 'Saved storage is unavailable or unreadable. You can still preview and copy; saving is disabled.';
}
$('save').disabled = !available;
fields.forEach((name, index) => {
  const label = document.createElement('label');
  label.htmlFor = `field-${index}`;
  label.textContent = name;
  const input = document.createElement('textarea');
  input.id = label.htmlFor;
  input.rows = 2;
  $('fields').append(label, input);
});
function review(text) {
  $('proposal').value = text;
  $('checked').checked = false;
  $('review').hidden = false;
  $('proposal').focus();
}
$('create-form').addEventListener('submit', event => {
  event.preventDefault();
  review(formatCard(fields.map((_, i) => $(`field-${i}`).value), new Date().toISOString()));
});
$('edit').onclick = () => review(saved);
$('propose').onclick = () => {
  try { review(proposeSummary(saved, $('returned').value)); }
  catch (error) { $('status').textContent = error.message; }
};
$('proposal').oninput = () => { $('checked').checked = false; };
$('cancel').onclick = () => {
  $('review').hidden = true;
  $('proposal').value = '';
  $('status').textContent = 'Proposal discarded. Saved card unchanged.';
};
function reviewed() {
  if (!$('checked').checked) throw new Error('Review the preview and check the confirmation first.');
  if (!$('proposal').value.trim()) throw new Error('The card cannot be empty.');
  return $('proposal').value;
}
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(reviewed());
    $('status').textContent = 'Copied. Paste into your chosen chat app. Copying does not save changes.';
  } catch (error) {
    $('status').textContent = `${error.message} If clipboard access is unavailable, select and copy the preview manually.`;
  }
};
$('save').onclick = () => {
  try {
    previous = saveReviewed(localStorage, previous, reviewed());
    showSaved(previous);
    $('review').hidden = true;
    $('status').textContent = 'Card saved on this device. Nothing was sent to a chat app or Operator inference.';
  } catch (error) { $('status').textContent = error.message; }
};
