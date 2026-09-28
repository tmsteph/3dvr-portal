const externalHref = /^https?:\/\//i;
const safeSchemes = /^(?:https?:|mailto:)/i;

export function isSafeOperatorHref(value) {
  const href = String(value || '').trim();
  if (!href) return false;
  if (safeSchemes.test(href)) return true;
  if (href.startsWith('#')) return true;
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  return href.startsWith('./') || href.startsWith('../');
}

function appendTextWithBreaks(parent, value) {
  String(value).split('\n').forEach((part, index) => {
    if (index) parent.append(document.createElement('br'));
    if (part) parent.append(document.createTextNode(part));
  });
}

function appendInline(parent, source) {
  const text = String(source ?? '');
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\[[^\]\n]+\]\([^\)\n]+\)|\*[^*\n]+?\*|_[^_\n]+?_)/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    appendTextWithBreaks(parent, text.slice(cursor, match.index));
    const token = match[0];
    let node = null;
    let inner = '';

    if (token.startsWith('`')) {
      node = document.createElement('code');
      node.textContent = token.slice(1, -1);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      node = document.createElement('strong');
      inner = token.slice(2, -2);
    } else if (token.startsWith('~~')) {
      node = document.createElement('del');
      inner = token.slice(2, -2);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((.+)\)$/);
      const label = linkMatch?.[1] || token;
      const href = linkMatch?.[2]?.trim() || '';
      if (isSafeOperatorHref(href)) {
        node = document.createElement('a');
        node.href = href;
        if (externalHref.test(href)) {
          node.target = '_blank';
          node.rel = 'noopener noreferrer';
        }
        inner = label;
      } else {
        appendInline(parent, label);
      }

    } else {
      node = document.createElement('em');
      inner = token.slice(1, -1);
    }

    if (node) {
      if (inner) appendInline(node, inner);
      parent.append(node);
    }

    cursor = pattern.lastIndex;
  }

  appendTextWithBreaks(parent, text.slice(cursor));
}

function startsBlock(line) {
  return /^\s*(?:```|#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(line);
}

function appendParagraph(target, lines) {
  const paragraph = document.createElement('p');
  lines.forEach((line, index) => {
    if (index) paragraph.append(document.createElement('br'));
    appendInline(paragraph, line);
  });
  target.append(paragraph);
}

export function paintOperatorMarkdown(target, markdown) {
  if (!target) return;
  target.replaceChildren();

  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([^\s`]*)\s*$/);
    if (fence) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (fence[1]) code.className = `language-${fence[1].replace(/[^a-z0-9_-]/gi, '')}`;
      code.textContent = codeLines.join('\n');
      pre.append(code);
      target.append(pre);
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      const node = document.createElement(`h${heading[1].length}`);
      appendInline(node, heading[2]);
      target.append(node);
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      const quote = document.createElement('blockquote');
      appendInline(quote, quoteLines.join('\n'));
      target.append(quote);
      continue;
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const list = document.createElement(ordered ? 'ol' : 'ul');

      const itemPattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
      while (index < lines.length) {
        const itemMatch = lines[index].match(itemPattern);
        if (!itemMatch) break;
        const item = document.createElement('li');
        appendInline(item, itemMatch[1]);
        list.append(item);
        index += 1;
      }
      target.append(list);
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      target.append(document.createElement('hr'));
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    appendParagraph(target, paragraphLines);
  }
}
