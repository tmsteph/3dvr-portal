import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const installer = await readFile(new URL('../ops/host/install-resource-lanes.sh', import.meta.url), 'utf8');
const docs = await readFile(new URL('../docs/ovh-resource-lanes.md', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/freelancer-workspace-host.yml', import.meta.url), 'utf8');

test('OVH keeps a dedicated protected recovery slice', () => {
  assert.match(installer, /3dvr-recovery\.slice/);
  assert.match(installer, /CPUWeight=10000/);
  assert.match(installer, /MemoryLow=256M/);
  assert.match(installer, /MemoryHigh=512M/);
  assert.match(installer, /MemoryMax=700M/);
  assert.match(installer, /TasksMax=768/);
  assert.match(workflow, /Slice=3dvr-recovery\.slice/);
});

test('dev lane constrains task fan-out and ad-hoc work gets a bounded runner', () => {
  assert.match(installer, /Description=3DVR development and AI experiments[\s\S]*TasksMax=768/);
  assert.match(installer, /\/usr\/local\/bin\/3dvr-run-dev/);
  assert.match(installer, /--property=TasksMax=384/);
  assert.match(installer, /--property=MemoryMax=1536M/);
  assert.match(installer, /--property=CPUQuota=150%/);
  assert.match(docs, /must not run directly in the Remote Desktop Commander\/login shell/);
});

test('existing session cleanup remains installed', () => {
  assert.match(installer, /3dvr-session-gc/);
  assert.match(installer, /3dvr-session-gc\.timer/);
});
