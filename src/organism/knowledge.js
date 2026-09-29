import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_PRIVATE_KNOWLEDGE_ROOT = '/home/debian/.local/share/3dvr/knowledge';
const MAX_NOTE_BYTES = 128 * 1024;
const MAX_NOTES = 250;

function rootPath(options = {}) {
  return path.resolve(String(
    options.root
      || options.config?.THREEDVR_PRIVATE_KNOWLEDGE_ROOT
      || process.env.THREEDVR_PRIVATE_KNOWLEDGE_ROOT
      || DEFAULT_PRIVATE_KNOWLEDGE_ROOT
  ).trim());
}

export function normalizeKnowledgePath(value = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!raw || raw.length > 300 || raw.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(raw)) return '';
  const withoutExt = raw.replace(/\.md$/i, '');
  if (!withoutExt || withoutExt.split('/').some(part => !part || part === '.' || part === '..')) return '';
  return withoutExt;
}

function notePath(root, note) {
  const normalized = normalizeKnowledgePath(note);
  if (!normalized) throw Object.assign(new Error('Invalid knowledge note path.'), { statusCode: 400 });
  const candidate = path.resolve(root, `${normalized}.md`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error('Knowledge note escaped the private root.'), { statusCode: 400 });
  }
  return { normalized, candidate };
}

async function walkMarkdown(root, current = root, output = []) {
  if (output.length >= MAX_NOTES) return output;
  let entries = [];
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return output;
    throw error;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdown(root, absolute, output);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const relative = path.relative(root, absolute).replace(/\\/g, '/').replace(/\.md$/i, '');
      const stat = await fs.stat(absolute);
      output.push({ path: relative, updatedAt: stat.mtime.toISOString() });
    }
    if (output.length >= MAX_NOTES) break;
  }
  return output;
}

export async function listPrivateKnowledge(options = {}) {
  const root = rootPath(options);
  const notes = await walkMarkdown(root);
  return { root: 'private-knowledge', notes };
}

export async function readPrivateKnowledge(note, options = {}) {
  const root = rootPath(options);
  const { normalized, candidate } = notePath(root, note);
  const stat = await fs.stat(candidate);
  if (!stat.isFile()) throw Object.assign(new Error('Knowledge note not found.'), { statusCode: 404 });
  if (stat.size > MAX_NOTE_BYTES) throw Object.assign(new Error('Knowledge note is too large to display.'), { statusCode: 413 });
  const content = await fs.readFile(candidate, 'utf8');
  return {
    path: normalized,
    content,
    updatedAt: stat.mtime.toISOString()
  };
}
