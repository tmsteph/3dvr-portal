const byAttention = (a, b) => {
  const aDue = a.due || '';
  const bDue = b.due || '';
  if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
  if (aDue && !bDue) return -1;
  if (!aDue && bDue) return 1;
  return Number(a.createdAt || 0) - Number(b.createdAt || 0);
};

const commitmentItem = (item, initiativeName) => ({
  kind: 'commitment',
  id: item.id,
  title: item.text,
  meta: [item.owner, initiativeName(item.initiativeId), item.due].filter(Boolean).join(' · ') || 'Owner not set',
});

export function deriveAssemblyFocus(state, nowLimit = 3) {
  const source = state && typeof state === 'object' ? state : {};
  const initiatives = Array.isArray(source.initiatives) ? source.initiatives : [];
  const commitments = Array.isArray(source.commitments) ? source.commitments : [];
  const decisions = Array.isArray(source.decisions) ? source.decisions : [];
  const needs = Array.isArray(source.needs) ? source.needs : [];
  const initiativeName = id => initiatives.find(item => item.id === id)?.name || '';
  const openCommitments = commitments.filter(item => !item.done).sort(byAttention);
  const now = openCommitments.slice(0, nowLimit).map(item => commitmentItem(item, initiativeName));
  const next = openCommitments.slice(nowLimit).map(item => commitmentItem(item, initiativeName));

  const activeInitiativeIds = new Set(openCommitments.map(item => item.initiativeId).filter(Boolean));
  for (const initiative of initiatives) {
    if (activeInitiativeIds.has(initiative.id)) continue;
    next.push({
      kind: 'initiative',
      id: initiative.id,
      title: initiative.name,
      meta: initiative.lead ? `Needs a next commitment · Lead: ${initiative.lead}` : 'Needs a next commitment',
    });
  }

  const waiting = [
    ...decisions.filter(item => !item.done).map(item => ({
      kind: 'decision',
      id: item.id,
      title: item.text,
      meta: item.owner ? `Decision · ${item.owner}` : 'Decision',
    })),
    ...needs.filter(item => !item.done).map(item => ({
      kind: 'need',
      id: item.id,
      title: item.text,
      meta: item.owner ? `Need · ${item.owner}` : 'Need',
    })),
  ];

  return { now, next, waiting };
}
