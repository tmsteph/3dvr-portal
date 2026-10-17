const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWrite } = require('./mission-store');

const safeSegment = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('invalid memory namespace');
  return value;
};
const dateKey = timestamp => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid timestamp');
  return date.toISOString().slice(0, 10);
};
function memoryPath(root, namespace, date) {
  return path.join(root, safeSegment(namespace), 'daily', `${dateKey(date)}.json`);
}
async function appendMemory({ root, namespace, content, source, timestamp = Date.now() }) {
  if (typeof content !== 'string' || !content.trim() || content.length > 16000) throw new Error('invalid memory content');
  if (typeof source !== 'string' || !source.trim() || source.length > 512) throw new Error('memory source required');
  const file = memoryPath(root, namespace, timestamp);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const record = { id: crypto.randomUUID(), timestamp: new Date(timestamp).toISOString(), source, content };
  // Atomic replacement avoids partial JSON; serialize writers with the caller's single-writer lease.
  let records = [];
  try { records = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(records)) throw new Error('invalid memory log');
  records.push(record);
  await atomicWrite(file, records);
  return record;
}
async function readDailyMemory(root, namespace, date) {
  const file = memoryPath(root, namespace, date);
  try {
    const records = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(records)) throw new Error('invalid memory log');
    return records;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
module.exports = { appendMemory, readDailyMemory, memoryPath };
