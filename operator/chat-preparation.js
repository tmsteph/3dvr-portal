// Optional context and signing recovery must never keep ordinary chat waiting forever.
export async function prepareOperatorChat({
  collectContext,
  createProof,
  recallMemory,
  prompt,
  timeoutMs = 4000
}) {
  const bounded = (operation, fallback) => new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), timeoutMs);
    Promise.resolve().then(operation).then(finish, () => finish(fallback));
  });
  return Promise.all([
    bounded(collectContext, {}),
    // Missing proof grants no developer permissions; the server still verifies all actions.
    bounded(createProof, null),
    bounded(() => recallMemory(prompt), null)
  ]);
}
