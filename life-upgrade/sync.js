const SYNC_NODE = 'life-upgrade-v01';

function getUserSecret(user) {
  return user?._?.sea || null;
}

function once(node, timerWindow = window) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      node.once(finish);
      timerWindow.setTimeout(() => finish(null), 2500);
    } catch {
      finish(null);
    }
  });
}

function put(node, value) {
  return new Promise((resolve) => {
    try {
      node.put(value, (ack) => resolve(!ack?.err));
    } catch {
      resolve(false);
    }
  });
}

export function createLifeUpgradeSync({ windowObj = window, onStatus = () => {} } = {}) {
  let gun;
  let user;
  let node;
  let secret;
  let ready = false;

  const init = async () => {
    if (typeof windowObj.Gun !== 'function' || !windowObj.SEA) return false;
    try {
      gun = windowObj.Gun({ peers: windowObj.__GUN_PEERS__ || [] });
      user = gun.user();
      user.recall?.({ sessionStorage: true });
      for (let attempt = 0; attempt < 12 && !user.is; attempt += 1) {
        await new Promise((resolve) => windowObj.setTimeout(resolve, 150));
      }
      secret = getUserSecret(user);
      if (!user.is?.pub || !secret || typeof windowObj.SEA.encrypt !== 'function') return false;
      node = user.get(SYNC_NODE).get('plan');
      ready = true;
      onStatus('Account sync is ready.');
      return true;
    } catch {
      return false;
    }
  };

  return {
    ready: init(),
    async load(localPlan) {
      if (!(await this.ready) || !node) return localPlan;
      const record = await once(node, windowObj);
      if (!record?.ciphertext) return localPlan;
      try {
        const decoded = await windowObj.SEA.decrypt(record.ciphertext, secret);
        if (typeof decoded === 'string') {
          try {
            return JSON.parse(decoded);
          } catch {
            return localPlan;
          }
        }
        return decoded && typeof decoded === 'object' ? decoded : localPlan;
      } catch {
        onStatus('Your account is connected, but its saved plan could not be opened.');
        return localPlan;
      }
    },
    async save(plan) {
      if (!(await this.ready) || !node) return false;
      try {
        const ciphertext = await windowObj.SEA.encrypt(JSON.stringify(plan), secret);
        const saved = await put(node, {
          schemaVersion: 1,
          updatedAt: plan.updatedAt,
          ciphertext
        });
        if (saved) onStatus('Saved securely to your account and this browser.');
        return saved;
      } catch {
        onStatus('Saved in this browser. Account sync will retry when available.');
        return false;
      }
    },
    async saveCompleted(plan) {
      if (!(await this.ready) || !node) return false;
      try {
        const historyNode = user.get(SYNC_NODE).get('completed');
        const record = await once(historyNode, windowObj);
        let history = [];
        if (record?.ciphertext) {
          const decoded = await windowObj.SEA.decrypt(record.ciphertext, secret);
          history = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
        }
        if (!Array.isArray(history)) history = [];
        if (!history.some((item) => item?.completedAt === plan.completedAt)) history.push(plan);
        const ciphertext = await windowObj.SEA.encrypt(JSON.stringify(history.slice(-12)), secret);
        return put(historyNode, { schemaVersion: 1, ciphertext });
      } catch {
        return false;
      }
    },
    isReady() {
      return ready;
    }
  };
}
