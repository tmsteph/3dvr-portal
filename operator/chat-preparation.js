// Optional context and signing recovery must never keep ordinary chat waiting forever.
export async function prepareOperatorChat({
  collectContext,
  createProof,
  recallMemory,
  prompt,
  timeoutMs = 4000,
  proofTimeoutMs
}) {
  const bounded = (operation, fallback, budgetMs = timeoutMs) => new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), budgetMs);
    Promise.resolve().then(operation).then(finish, () => finish(fallback));
  });
  return Promise.all([
    bounded(collectContext, {}),
    // Missing proof grants no developer permissions; the server still verifies all actions.
    // Signing can involve a cold Gun/SEA session restore plus retries, so a
    // caller may give the proof its own longer budget: a slow-but-valid proof
    // must not silently downgrade a signed-in member to guest (#3763).
    bounded(createProof, null, proofTimeoutMs ?? timeoutMs),
    bounded(() => recallMemory(prompt), null)
  ]);
}
