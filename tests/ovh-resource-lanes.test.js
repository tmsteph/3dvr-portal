import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const installer = await readFile(new URL('../ops/host/install-resource-lanes.sh', import.meta.url), 'utf8');
const docs = await readFile(new URL('../docs/ovh-resource-lanes.md', import.meta.url), 'utf8');

test('OVH keeps a dedicated protected control slice', () => {
  assert.match(installer, /3dvr-control\.slice/);
  assert.match(installer, /MemoryMin=256M/);
  assert.match(installer, /MemoryLow=512M/);
  assert.match(installer, /TasksMax=256/);
  assert.match(docs, /Remote Desktop Commander/);
});

test('dev lane constrains task fan-out and ad-hoc work gets a bounded runner', () => {
  assert.match(installer, /Description=3DVR development and AI experiments[\s\S]*TasksMax=768/);
  assert.match(installer, /\/usr\/local\/bin\/3dvr-run-dev/);
  assert.match(installer, /--property=TasksMax=384/);
  assert.match(installer, /--property=MemoryMax=1536M/);
  assert.match(installer, /--property=CPUQuota=150%/);
  assert.match(docs, /must not run directly in the login\/control shell/);
});

test('lane status exposes host-global PID pressure', () => {
  assert.match(installer, /pids\.current/);
  assert.match(installer, /pids\.max/);
});
