'use strict';

// Gate 1, Step 3: owner memory as plain markdown files.
//
// Memory lives in ONE configured directory of files the owner can read and
// edit directly: top-level MEMORY.md / USER.md / SOUL.md, people/*.md,
// groups/*.md, and daily notes under memory/*.md. Files only - no database,
// no index on disk; the directory is re-read on each use so owner edits are
// picked up immediately.
//
// Two directions:
// 1. Read: keyword search over paragraph blocks returns a bounded set of
//    relevant excerpts, which the planner injects into the model prompt as
//    background context. Irrelevant files contribute nothing.
// 2. Write-back: NEVER silent. The planner proposes a `memory.write` action
//    through OperatorCore policy carrying the exact new content plus a
//    visible line diff in its (hash-bound) args. After the core executes
//    the approved action, applyApprovedWrite re-derives the diff from the
//    file as it exists NOW and applies the write only if it still matches
//    the approved diff exactly - so a file the owner edited in the meantime,
//    or a substituted diff, is refused instead of clobbered.

const fs = require('node:fs');
const path = require('node:path');

const MEMORY_WRITE_CAPABILITY = 'memory.write';

const TOP_LEVEL_FILES = ['MEMORY.md', 'USER.md', 'SOUL.md'];
const SUB_DIRS = ['people', 'groups', 'memory'];

const DEFAULT_MAX_EXCERPTS = 5;
const DEFAULT_MAX_EXCERPT_CHARS = 600;
const DEFAULT_MAX_TOTAL_CHARS = 3000;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'do', 'does', 'did', 'what', 'when',
  'where', 'who', 'how', 'why', 'me', 'my', 'we', 'you', 'it', 'its',
  'this', 'that', 'about', 'tell', 'please', 'show',
]);

function tokenize(text) {
  const words = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(words.filter((w) => w.length >= 3 && !STOPWORDS.has(w)))];
}

// Canonicalise a path: realpathSync resolves symlinks for paths that
// exist; for a not-yet-existing target, canonicalise its nearest existing
// ancestor and re-append the remainder, so a symlinked parent directory
// cannot smuggle the target outside the tree either.
function canonicalize(p) {
  try {
    return fs.realpathSync(p);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
    const parent = path.dirname(p);
    if (parent === p) throw err;
    return path.join(canonicalize(parent), path.basename(p));
  }
}

// Resolve relPath inside dir; refuse absolute paths and escapes. Memory
// paths are always plain relative markdown paths from the owner. The
// boundary is enforced on the CANONICAL path, not just the lexical one:
// a memory file - or any parent directory of it - that is a symlink
// pointing outside the memory directory is refused for reads and writes.
function resolveInside(dir, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error('memory path must be a non-empty relative path');
  }
  if (path.isAbsolute(relPath)) {
    throw new Error(`memory path must be relative: ${relPath}`);
  }
  const root = path.resolve(dir);
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`memory path escapes the memory directory: ${relPath}`);
  }
  const canonRoot = canonicalize(root);
  const canonTarget = canonicalize(target);
  if (canonTarget !== canonRoot && !canonTarget.startsWith(canonRoot + path.sep)) {
    throw new Error(`memory path escapes the memory directory: ${relPath}`);
  }
  return canonTarget;
}

// Deterministic line diff (LCS-based). Same inputs always produce the same
// string, which is what lets applyApprovedWrite verify an approved diff by
// re-deriving it. Format is a single-hunk unified-style diff.
function diffLines(oldText, newText, label = 'memory') {
  const split = (t) => {
    if (t === '') return [];
    const lines = t.split('\n');
    if (lines[lines.length - 1] === '') lines.pop(); // trailing newline is not a line
    return lines;
  };
  const a = split(oldText);
  const b = split(newText);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const body = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { body.push(` ${a[i]}`); i += 1; j += 1; } else if (dp[i + 1][j] >= dp[i][j + 1]) { body.push(`-${a[i]}`); i += 1; } else { body.push(`+${b[j]}`); j += 1; }
  }
  while (i < n) { body.push(`-${a[i]}`); i += 1; }
  while (j < m) { body.push(`+${b[j]}`); j += 1; }
  return [
    `--- a/${label}`,
    `+++ b/${label}`,
    `@@ -1,${n} +1,${m} @@`,
    ...body,
  ].join('\n');
}

function createFileMemoryStore(dir, options = {}) {
  if (!dir || typeof dir !== 'string') {
    throw new Error('createFileMemoryStore needs a memory directory');
  }
  const maxExcerpts = options.maxExcerpts ?? DEFAULT_MAX_EXCERPTS;
  const maxExcerptChars = options.maxExcerptChars ?? DEFAULT_MAX_EXCERPT_CHARS;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;

  // Load every memory file that exists. Missing directory/files are not an
  // error - memory is optional and an owner may start with an empty folder.
  function load() {
    const entries = [];
    const readInto = (relPath) => {
      try {
        const content = fs.readFileSync(resolveInside(dir, relPath), 'utf8');
        entries.push({ source: relPath, content });
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
    };
    for (const name of TOP_LEVEL_FILES) readInto(name);
    for (const sub of SUB_DIRS) {
      let names = [];
      try {
        names = fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith('.md')).sort();
      } catch (err) {
        if (!err || err.code !== 'ENOENT') throw err;
      }
      for (const name of names) readInto(path.join(sub, name));
    }
    return entries;
  }

  // Keyword search: score paragraph blocks by how many distinct query terms
  // they contain, return the best few, hard-bounded in count and size so
  // what reaches the model prompt is always a small, relevant excerpt set.
  function search(query) {
    const terms = tokenize(query);
    if (terms.length === 0) return [];
    const scored = [];
    for (const entry of load()) {
      const blocks = entry.content.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      blocks.forEach((block, index) => {
        const haystack = block.toLowerCase();
        let distinct = 0;
        let hits = 0;
        for (const term of terms) {
          const count = haystack.split(term).length - 1;
          if (count > 0) { distinct += 1; hits += count; }
        }
        if (distinct > 0) {
          scored.push({
            source: entry.source, text: block, score: distinct * 10 + Math.min(hits, 10), index,
          });
        }
      });
    }
    scored.sort((x, y) => (y.score - x.score) || (x.index - y.index));
    const results = [];
    let total = 0;
    for (const hit of scored) {
      if (results.length >= maxExcerpts) break;
      let text = hit.text;
      if (text.length > maxExcerptChars) text = `${text.slice(0, maxExcerptChars)}…`;
      if (results.length > 0 && total + text.length > maxTotalChars) break;
      if (text.length > maxTotalChars) text = `${text.slice(0, maxTotalChars)}…`;
      total += text.length;
      results.push({ source: hit.source, text, score: hit.score });
    }
    return results;
  }

  // Format search hits as the context block handed to the model router.
  function format(hits) {
    return hits.map((h) => `[${h.source}]\n${h.text}`).join('\n\n');
  }

  // Current content of one memory file, or null when it does not exist yet.
  function readText(relPath) {
    try {
      return fs.readFileSync(resolveInside(dir, relPath), 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  function diff(oldText, newText, relPath) {
    return diffLines(oldText, newText, relPath);
  }

  // Apply a write-back that OperatorCore has already approved and executed.
  // The write lands ONLY when the diff re-derived from the file's current
  // content matches the approved diff exactly; otherwise nothing is written.
  function applyApprovedWrite({ relPath, newContent, diff: approvedDiff }) {
    const target = resolveInside(dir, relPath);
    const current = readText(relPath) ?? '';
    const actualDiff = diffLines(current, newContent, relPath);
    if (actualDiff !== approvedDiff) {
      return {
        applied: false,
        reason: 'current file no longer matches the approved diff - refusing to write',
      };
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, newContent, 'utf8');
    return { applied: true };
  }

  return {
    dir, load, search, format, readText, diff, applyApprovedWrite,
  };
}

module.exports = {
  createFileMemoryStore,
  diffLines,
  tokenize,
  MEMORY_WRITE_CAPABILITY,
  DEFAULT_MAX_EXCERPTS,
  DEFAULT_MAX_EXCERPT_CHARS,
  DEFAULT_MAX_TOTAL_CHARS,
};
