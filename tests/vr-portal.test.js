import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createInitialPortalState,
  deletePortalRecord,
  filterPortalRecords,
  flattenRecordForGun,
  getAppById,
  getAppSummary,
  normalizePortalState,
  upsertPortalRecord
} from '../vr-portal/data.js';

test('spatial portal page ships a Three.js scene and editable core app workspace', async () => {
  const html = await readFile(new URL('../vr-portal/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../vr-portal/app.js', import.meta.url), 'utf8');

  assert.match(html, /Spatial workspace/);
  assert.match(html, /id="spatial-canvas"/);
  assert.match(html, /id="record-form"/);
  assert.match(html, /id="app-frame"/);
  assert.match(app, /three@0\.165\.0\/build\/three\.module\.js/);
  assert.match(app, /gun\.get\('3dvr-portal'\)\.get\('spatialPortal'\)\.get\('apps'\)/);
});

test('spatial portal data supports app selection, filtering, editing, and deletion', () => {
  const state = createInitialPortalState();
  const crm = getAppById(state, 'crm');

  assert.equal(state.apps.length >= 5, true);
  assert.equal(filterPortalRecords(crm, 'nova').length, 1);

  upsertPortalRecord(state, 'crm', {
    id: 'crm-test',
    title: 'Test Studio',
    stage: 'Lead',
    owner: 'Casey',
    due: '2026-06-30',
    body: 'Needs a headset-ready CRM walkthrough.'
  });

  assert.equal(state.selectedRecordId, 'crm-test');
  assert.equal(filterPortalRecords(crm, 'headset crm').length, 1);
  assert.equal(getAppSummary(crm).total, 3);

  deletePortalRecord(state, 'crm', 'crm-test');
  assert.equal(filterPortalRecords(crm, 'Test Studio').length, 0);
});

test('spatial portal normalizes cached state and flattens records for Gun', () => {
  const state = normalizePortalState({
    selectedAppId: 'notes',
    selectedRecordId: 'notes-new',
    apps: [
      {
        id: 'notes',
        records: [
          {
            id: 'notes-new',
            title: 'Cached page',
            space: 'Research',
            owner: 'Alex',
            body: 'Recovered from local cache.'
          }
        ]
      }
    ]
  });

  assert.equal(state.selectedAppId, 'notes');
  assert.equal(state.selectedRecordId, 'notes-new');
  assert.equal(filterPortalRecords(getAppById(state, 'notes'), 'cached').length, 1);

  assert.deepEqual(flattenRecordForGun({ id: 'x', title: 'Record', meta: { nested: true } }), {
    id: 'x',
    title: 'Record',
    meta: '{"nested":true}'
  });
});

test('background sync can update records without stealing app selection', () => {
  const state = createInitialPortalState();
  state.selectedAppId = 'crm';
  state.selectedRecordId = 'crm-nova';

  upsertPortalRecord(state, 'finance', {
    id: 'finance-sync',
    title: 'Synced budget',
    stage: 'Forecast'
  }, { select: false });

  assert.equal(state.selectedAppId, 'crm');
  assert.equal(state.selectedRecordId, 'crm-nova');
  assert.equal(filterPortalRecords(getAppById(state, 'finance'), 'Synced budget').length, 1);
});
