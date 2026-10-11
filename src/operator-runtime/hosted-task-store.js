import { mkdir, open, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { admitHostedTask, taskVisibleToTenant } from './hosted-task-admission.js';

export class HostedTaskStore {
  constructor(path) { this.path = path; this.lockPath = path + '.lock'; }
  async read() {
    try { return JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async transact(fn) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    let lock;
    for (let i = 0; i < 50; i++) {
      try { lock = await open(this.lockPath, 'wx', 0o600); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    if (!lock) throw new Error('task_store_busy');
    try {
      const tasks = await this.read();
      const outcome = await fn(tasks);
      const temp = this.path + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temp, JSON.stringify(tasks), { mode: 0o600 });
        await rename(temp, this.path);
      } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      return outcome;
    } finally {
      await lock.close();
      await unlink(this.lockPath);
    }
  }
  async submit(tenantId, request, limits) {
    return this.transact(tasks => {
      const result = admitHostedTask({ tenantId, request, existing: tasks, limits });
      if (!result.ok || result.duplicate) return result;
      const now = new Date().toISOString();
      const task = { ...result.task, id: randomUUID(), createdAt: now, updatedAt: now, attempts: 0 };
      tasks.push(task);
      return { ok: true, duplicate: false, task };
    });
  }
  async get(tenantId, id) {
    const task = (await this.read()).find(item => item.id === id);
    return taskVisibleToTenant(task, tenantId) ? task : null;
  }
  async claim(id, leaseMs = 60_000) {
    return this.transact(tasks => {
      const task = tasks.find(item => item.id === id);
      if (!task || task.status !== 'queued') return null;
      task.status = 'running';
      task.attempts += 1;
      task.leaseUntil = new Date(Date.now() + leaseMs).toISOString();
      task.updatedAt = new Date().toISOString();
      return { ...task };
    });
  }
  async complete(id, result) {
    return this.transact(tasks => {
      const task = tasks.find(item => item.id === id);
      if (!task || task.status !== 'running') return false;
      task.status = 'completed';
      task.result = String(result).slice(0, 4000);
      task.leaseUntil = null;
      task.updatedAt = new Date().toISOString();
      return true;
    });
  }
  async recoverExpired(now = Date.now()) {
    return this.transact(tasks => {
      let recovered = 0;
      for (const task of tasks) {
        if (task.status === 'running' && Date.parse(task.leaseUntil) <= now) {
          task.status = task.attempts >= 3 ? 'failed' : 'queued';
          task.leaseUntil = null;
          task.updatedAt = new Date(now).toISOString();
          recovered++;
        }
      }
      return recovered;
    });
  }
}
