#!/usr/bin/env node

import Gun from 'gun';

const SOURCE_PEER = 'https://gun-manhattan.herokuapp.com/gun';
const TARGET_PEER = 'https://gun-relay-3dvr.fly.dev/gun';
const ROOT_KEY = '3dvr-portal';
const TIMEOUT_MS = 20000;

const COLLECTIONS = [
  { key: 'userIndex', label: 'user profiles' },
  { key: 'userStats', label: 'user statistics' },
  { key: 'admins', label: 'admin roster' },
  { key: 'adminRequests', label: 'admin requests' }
];

const sourceGun = Gun({ peers: [SOURCE_PEER] });
const targetGun = Gun({ peers: [TARGET_PEER] });

const sourceRoot = sourceGun.get(ROOT_KEY);
const targetRoot = targetGun.get(ROOT_KEY);

function onceWithTimeout(node, description, timeout = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout while attempting to ${description}`));
    }, timeout);

    node.once(data => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function putWithAck(node, value, description, timeout = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout while writing ${description}`));
    }, timeout);

    node.put(value, ack => {
      clearTimeout(timer);
      if (ack && ack.err) {
        reject(new Error(`Failed to write ${description}: ${ack.err}`));
        return;
      }
      resolve();
    });
  });
}

function cleanData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => cleanData(item));
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (!key || key === '_' || typeof value === 'function') {
      continue;
    }

    if (value && typeof value === 'object') {
      const cleaned = cleanData(value);
      if (cleaned === undefined) {
        continue;
      }
      result[key] = cleaned;
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

function hasContent(data) {
  if (data === null || data === undefined) {
    return false;
  }

  if (typeof data !== 'object') {
    return true;
  }

  if (Array.isArray(data)) {
    return data.length > 0;
  }

  return Object.keys(data).length > 0;
}

async function migrateCollection({ key, label }) {
  console.log(`\n⏳ Loading ${label} (${key}) from Manhattan...`);
  const raw = await onceWithTimeout(sourceRoot.get(key), `read ${key} from Manhattan`);
  const entryKeys = Object.keys(raw || {}).filter(entryKey => entryKey && entryKey !== '_' && entryKey !== '#');

  if (!entryKeys.length) {
    console.log(`ℹ️ No records found for ${key}.`);
    return { key, count: 0 };
  }

  console.log(`📦 Migrating ${entryKeys.length} records for ${key} to Fly.io...`);
  let count = 0;

  for (const entryKey of entryKeys) {
    const entryRaw = await onceWithTimeout(sourceRoot.get(key).get(entryKey), `read ${key}/${entryKey}`);
    const entryData = cleanData(entryRaw);

    if (!hasContent(entryData)) {
      continue;
    }

    await putWithAck(targetRoot.get(key).get(entryKey), entryData, `${key}/${entryKey}`);
    count += 1;
  }

  console.log(`✅ Finished migrating ${count} ${label}.`);
  return { key, count };
}

async function main() {
  console.log('🚀 Starting Gun data migration from Manhattan to Fly.io...');
  const summaries = [];

  for (const collection of COLLECTIONS) {
    const summary = await migrateCollection(collection);
    summaries.push(summary);
  }

  console.log('\n📊 Migration summary:');
  for (const summary of summaries) {
    console.log(`  • ${summary.key}: ${summary.count} records migrated`);
  }

  console.log('\n✨ Migration complete.');
  process.exit(0);
}

main().catch(error => {
  console.error('\n❌ Migration failed:', error.message || error);
  process.exit(1);
});
