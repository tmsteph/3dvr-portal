'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  fileList,
  fileRead,
  fileWrite,
  loadPolicy,
  runCommand,
  serviceAction,
} = require('../connectors/control/local-machine');

test('file tools stay inside configured roots and mutations default off', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-control-'));
  fs.writeFileSync(path.join(root, 'hello.txt'), 'hello');
  const policy = { ...loadPolicy({}), fileRoots: [root], enableMutations: false };
  assert.equal(fileRead(path.join(root, 'hello.txt'), { policy }).content, 'hello');
  assert.equal(fileList(root, { policy }).entries[0].name, 'hello.txt');
  assert.throws(() => fileRead('/etc/passwd', { policy }), /outside configured roots/);
  assert.throws(() => fileWrite(path.join(root, 'new.txt'), 'x', { policy }), /mutating control capabilities are disabled/);
});

test('file writes are atomic when enabled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-control-write-'));
  const target = path.join(root, 'state.txt');
  fs.writeFileSync(target, 'old');
  const policy = { ...loadPolicy({}), fileRoots: [root], enableMutations: true };
  fileWrite(target, 'new', { policy });
  assert.equal(fs.readFileSync(target, 'utf8'), 'new');
});

test('service mutations use only the configured helper', async () => {
  const calls = [];
  const policy = {
    ...loadPolicy({}),
    enableMutations: true,
    services: ['demo.service'],
    serviceHelper: '/usr/local/sbin/3dvr-control-service',
  };
  const runImpl = async (file, args) => {
    calls.push([file, args]);
    if (file === 'systemctl') return { stdout: 'Id=demo.service\nActiveState=active\nSubState=running\nMainPID=123\n' };
    return { stdout: '', stderr: '' };
  };
  const result = await serviceAction('demo.service', 'restart', { policy, runImpl });
  assert.equal(result.activeState, 'active');
  assert.deepEqual(calls[0], ['/usr/local/sbin/3dvr-control-service', ['restart', 'demo.service']]);
});

test('approved command ids never accept arbitrary executable paths', async () => {
  const policy = { ...loadPolicy({}), enableMutations: true };
  const commands = {
    demo: { file: '/usr/bin/printf', args: ['ok'], mutating: false },
  };
  const result = await runCommand('demo', {
    policy,
    commands,
    runImpl: async (file, args) => ({ stdout: `${file} ${args.join(' ')}`, stderr: '' }),
  });
  assert.equal(result.commandId, 'demo');
  await assert.rejects(() => runCommand('/bin/sh', { policy, commands }), /unknown command id/);
});
