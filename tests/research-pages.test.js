import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('research library publishes canonical Markdown as portal pages', async () => {
  const [library, paperPage, logPage, viewer, paper, science] = await Promise.all([
    read('../research/index.html'),
    read('../research/milestone-supervised-agent-hierarchies/index.html'),
    read('../research/openclaw-distributed-agent-orchestration/index.html'),
    read('../research/viewer.js'),
    read('../docs/research/milestone-supervised-agent-hierarchies.md'),
    read('../science/index.html'),
  ]);

  assert.match(library, /Milestone-Supervised Agent Hierarchies/);
  assert.match(library, /OpenClaw as a Distributed Personal Agent Runtime/);
  assert.match(paperPage, /data-document="\/docs\/research\/milestone-supervised-agent-hierarchies\.md"/);
  assert.match(logPage, /data-document="\/docs\/research\/openclaw-distributed-agent-orchestration\.md"/);
  assert.match(viewer, /DOMPurify\.sanitize/);
  assert.match(viewer, /fetch\(source/);
  assert.match(paper, /## 12\. Experimental design/);
  assert.match(paper, /## 14\. Limitations and risks/);
  assert.match(science, /href="\/research\/"/);
  assert.match(science, /3DVR Research Library/);
});
