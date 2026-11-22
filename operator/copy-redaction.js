// Best-effort, device-local text matching. A match is not proof of identity.
const RULES = [
  ['EMAIL', /(?<![\p{L}\p{N}._%+@-])[a-z0-9_%+-][a-z0-9_%+'-]*(?:\.[a-z0-9_%+'-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?![\p{L}\p{N}_@-]|\.[\p{L}\p{N}])/giu],
  ['SSN', /(?<![\p{L}\p{N}_-])[0-9]{3}-[0-9]{2}-[0-9]{4}(?![\p{L}\p{N}_-])/gu],
  ['PHONE', /(?<![\p{L}\p{N}_+.-])(?:(?:\+1|1)[ .-]?)?(?:\([2-9][0-9]{2}\)[ .-]?|[2-9][0-9]{2}[ .-])[2-9][0-9]{2}[ .-][0-9]{4}(?![\p{L}\p{N}_-]|\.[0-9])/gu],
  ['IPV4', /(?<![\p{L}\p{N}_.-])(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}(?![\p{L}\p{N}_-]|\.[0-9])/gu],
];

export const COPY_REDACTION_LIMIT = 100_000;

export function redactCopyText(source) {
  if (source.length > COPY_REDACTION_LIMIT) throw new RangeError('Preview text is too long.');
  const replacements = [];
  for (const [type, pattern] of RULES) {
    for (const match of source.matchAll(pattern)) {
      if (type === 'IPV4' && match[0].split('.').some(octet => Number(octet) > 255)) continue;
      replacements.push({ type, start: match.index, end: match.index + match[0].length });
    }
  }
  replacements.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  const chunks = [];
  const counts = {};
  for (const { type, start, end } of replacements) {
    if (start < cursor) continue;
    chunks.push(source.slice(cursor, start), `[${type}]`);
    counts[type] = (counts[type] ?? 0) + 1;
    cursor = end;
  }
  chunks.push(source.slice(cursor));
  return { text: chunks.join(''), counts };
}

export function installCopyRedaction({ button, dialog, field, summary, copy, close, getText, getClipboard, report }) {
  if (!button || !dialog?.showModal || !field || !summary || !copy || !close) return;
  let generation = 0;
  button.hidden = false;
  button.addEventListener('click', () => {
    if (dialog.open) return;
    const source = getText();
    if (!source) return report('Nothing to copy yet');
    if (source.length > COPY_REDACTION_LIMIT) return report('Conversation is too long to preview. Start with a shorter conversation.');
    const { text, counts } = redactCopyText(source);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    field.value = text;
    summary.textContent = total ? `${total} replacement${total === 1 ? '' : 's'}. Review before copying.` : 'No supported patterns found. Review before copying.';
    generation += 1;
    copy.disabled = false;
    dialog.showModal();
  });
  copy.addEventListener('click', async () => {
    if (!dialog.open || copy.disabled) return;
    const request = generation;
    copy.disabled = true;
    try {
      await getClipboard().writeText(field.value);
      if (request === generation && dialog.open) summary.textContent = 'Preview copied.';
    } catch {
      if (request !== generation || !dialog.open) return;
      field.focus();
      field.select();
      summary.textContent = 'The browser blocked automatic copy. Copy the selected preview manually.';
    } finally {
      if (request === generation && dialog.open) copy.disabled = false;
    }
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    generation += 1;
    field.value = '';
    summary.textContent = '';
  });
}
