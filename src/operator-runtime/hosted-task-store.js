import { mkdirSync, existsSync, readFileSync, chmodSync, openSync, closeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { admitHostedTask, taskVisibleToTenant } from './hosted-task-admission.js';

const cents = value => Number.isSafeInteger(value) && value >= 0;

// Tasks and spending reservations commit together. SQLite owns the process lock:
// a killed writer rolls back without deleting another writer's lock by age.
export class HostedTaskStore {
  constructor(path) { this.path = path; this.databasePath = path + '.sqlite'; }
  database() {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    try { closeSync(openSync(this.databasePath, 'wx', 0o600)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const db = new DatabaseSync(this.databasePath);
    try {
      chmodSync(this.databasePath, 0o600);
      db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS budgets (tenant TEXT PRIMARY KEY, allowance INTEGER NOT NULL,
          reserved INTEGER NOT NULL DEFAULT 0, accounted INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
      return db;
    } catch (error) { db.close(); throw error; }
  }
  transaction(fn) {
    const db = this.database();
    try {
      db.exec('BEGIN IMMEDIATE');
      if (!db.prepare("SELECT value FROM metadata WHERE key='json-imported'").get()) {
        // Never migrate underneath an old JSON writer, or discard an unknown lock.
        if (existsSync(this.path + '.lock')) throw new Error('legacy_task_store_locked');
        const legacy = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : [];
        if (!Array.isArray(legacy)) throw new Error('invalid_legacy_task_store');
        // Cutover of nonempty legacy stores requires an explicit offline migration.
        // Default startup must not silently fork an active JSON writer's state.
        if (legacy.length) throw new Error('legacy_migration_required');
        db.prepare('INSERT INTO metadata VALUES (?, ?)').run('json-imported', 'true');
      }
      const result = fn(db);
      if (result && typeof result.then === 'function') throw new Error('async_transaction_not_supported');
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    } finally { db.close(); }
  }
  save(db, task) {
    db.prepare('INSERT INTO tasks VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .run(task.id, task.tenantId, JSON.stringify(task));
  }
  async read() {
    return this.transaction(db => db.prepare('SELECT body FROM tasks').all().map(row => JSON.parse(row.body)));
  }
  // Trusted operator provisioning only. No HTTP endpoint or client field can fund a budget.
  async setBudget(tenantId, allowanceCents) {
    if (typeof tenantId !== 'string' || !/^[a-zA-Z0-9:._-]{1,256}$/.test(tenantId) || !cents(allowanceCents)) {
      throw new Error('invalid_budget');
    }
    return this.transaction(db => {
      const prior = db.prepare('SELECT * FROM budgets WHERE tenant=?').get(tenantId);
      if (prior && allowanceCents < prior.reserved + prior.accounted) throw new Error('budget_below_committed');
      db.prepare('INSERT INTO budgets (tenant, allowance) VALUES (?, ?) '
        + 'ON CONFLICT(tenant) DO UPDATE SET allowance=excluded.allowance').run(tenantId, allowanceCents);
      return this.budgetIn(db, tenantId);
    });
  }
  budgetIn(db, tenantId) {
    const row = db.prepare('SELECT * FROM budgets WHERE tenant=?').get(tenantId);
    return row ? { allowanceCents: row.allowance, reservedCents: row.reserved,
      accountedCents: row.accounted, remainingCents: row.allowance - row.reserved - row.accounted } : null;
  }
  async budget(tenantId) { return this.transaction(db => this.budgetIn(db, tenantId)); }
  async submit(tenantId, request, limits = {}) {
    if (typeof tenantId !== 'string') return { ok: false, reason: 'unauthenticated' };
    return this.transaction(db => {
      const tasks = db.prepare('SELECT body FROM tasks WHERE tenant=?').all(tenantId).map(row => JSON.parse(row.body));
      const budget = this.budgetIn(db, tenantId);
      const reservationCents = limits.reservationCents;
      // Caller snapshots and request fields never establish or refill the durable allowance.
      const result = admitHostedTask({ tenantId, request, existing: tasks,
        limits: { maxActive: limits.maxActive, remainingCents: budget?.remainingCents || 0 } });
      if (!result.ok || result.duplicate) return result;
      if (!cents(reservationCents) || reservationCents < 1) return { ok: false, reason: 'invalid_reservation' };
      if (reservationCents > budget.remainingCents) return { ok: false, reason: 'budget_exhausted' };
      const now = new Date().toISOString();
      const task = { ...result.task, id: randomUUID(), createdAt: now, updatedAt: now, attempts: 0,
        reservationCents, accountingState: 'reserved' };
      db.prepare('UPDATE budgets SET reserved=reserved+? WHERE tenant=?').run(reservationCents, tenantId);
      this.save(db, task);
      return { ok: true, duplicate: false, task };
    });
  }
  async get(tenantId, id) {
    return this.transaction(db => {
      const row = db.prepare('SELECT body FROM tasks WHERE id=? AND tenant=?').get(id, tenantId);
      const task = row ? JSON.parse(row.body) : null;
      return taskVisibleToTenant(task, tenantId) ? task : null;
    });
  }
  async cancel(tenantId, id) {
    return this.transaction(db => {
      const row = db.prepare('SELECT body FROM tasks WHERE id=? AND tenant=?').get(id, tenantId);
      const task = row ? JSON.parse(row.body) : null;
      if (!taskVisibleToTenant(task, tenantId)) return { ok: false, reason: 'not_found' };
      if (task.status === 'cancelled') return { ok: true, task, duplicate: true };
      if (!['queued', 'running'].includes(task.status)) return { ok: false, reason: 'task_terminal' };
      // Recovered queued tasks may already have incurred cost on an earlier attempt.
      if (task.status === 'queued' && task.attempts === 0 && task.accountingState === 'reserved') {
        db.prepare('UPDATE budgets SET reserved=reserved-? WHERE tenant=?').run(task.reservationCents, tenantId);
        task.accountingState = 'released_unstarted';
      }
      task.status = 'cancelled';
      task.leaseUntil = null;
      task.leaseToken = null;
      task.updatedAt = new Date().toISOString();
      this.save(db, task);
      return { ok: true, task, duplicate: false };
    });
  }
  async claim(id, leaseMs = 60_000) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 60_000) throw new Error('invalid_lease');
    return this.transaction(db => {
      const row = db.prepare('SELECT body FROM tasks WHERE id=?').get(id);
      const task = row ? JSON.parse(row.body) : null;
      // Legacy unbudgeted work cannot execute until explicitly reconciled by an operator.
      if (!task || task.status !== 'queued' || task.accountingState !== 'reserved') return null;
      task.status = 'running'; task.attempts += 1; task.leaseToken = randomUUID();
      task.leaseUntil = new Date(Date.now() + leaseMs).toISOString(); task.updatedAt = new Date().toISOString();
      this.save(db, task);
      return { ...task };
    });
  }
  async complete(id, result, leaseToken) {
    return this.transaction(db => {
      const row = db.prepare('SELECT body FROM tasks WHERE id=?').get(id);
      const task = row ? JSON.parse(row.body) : null;
      if (!task || task.status !== 'running' || !leaseToken || task.leaseToken !== leaseToken
        || Date.parse(task.leaseUntil) <= Date.now() || task.accountingState !== 'reserved') return false;
      // Conservatively account the full ceiling, never label it measured provider usage.
      db.prepare('UPDATE budgets SET reserved=reserved-?, accounted=accounted+? WHERE tenant=?')
        .run(task.reservationCents, task.reservationCents, task.tenantId);
      task.status = 'completed'; task.result = String(result).slice(0, 4000);
      task.accountingState = 'accounted_upper_bound';
      task.usage = { accountedCents: task.reservationCents, costBasis: 'reserved_upper_bound' };
      task.leaseUntil = null; task.leaseToken = null; task.updatedAt = new Date().toISOString();
      this.save(db, task);
      return true;
    });
  }
  async recoverExpired(now = Date.now()) {
    return this.transaction(db => {
      let recovered = 0;
      for (const row of db.prepare('SELECT body FROM tasks').all()) {
        const task = JSON.parse(row.body);
        if (task.status === 'running' && Date.parse(task.leaseUntil) <= now) {
          task.status = task.attempts >= 3 ? 'failed' : 'queued';
          task.leaseUntil = null; task.leaseToken = null; task.updatedAt = new Date(now).toISOString();
          // Unknown execution cost remains reserved across retries and terminal failures.
          this.save(db, task); recovered++;
        }
      }
      return recovered;
    });
  }
}
