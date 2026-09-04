import Gun from 'gun';

const PEER = process.env.THREEDVR_GUN_RELAY || 'https://gun-relay-3dvr.fly.dev/gun';

function readNode(node, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);
    node.once((data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(data && typeof data === 'object' ? data : null);
    });
  });
}

export default async function handler(req, res) {
  const ids = String(req.query?.ids || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (!ids.length) {
    return res.status(400).json({ ok: false, error: 'ids required' });
  }

  const gun = Gun({ peers: [PEER], localStorage: false, radisk: false });
  const root = gun.get('3dvr-crm');
  const rows = await Promise.all(ids.map(async (id) => {
    const data = await readNode(root.get(id));
    return {
      id,
      found: Boolean(data && data.id),
      name: data?.name || null,
      company: data?.company || null,
      status: data?.status || null,
      nextBestAction: data?.nextBestAction || null,
      updated: data?.updated || null,
    };
  }));

  const found = rows.filter((row) => row.found).length;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, requested: ids.length, found, rows });
}
