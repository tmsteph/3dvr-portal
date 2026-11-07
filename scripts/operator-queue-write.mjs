// Write in order; a failed or uncertain acknowledgment must never trigger a blind retry.
export async function writeQueueRecords(entries, write) {
  const results = [];
  for (const [key, value] of entries) {
    let result;
    try { result = await write(key, value); }
    catch (error) { result = { acknowledged: false, error: String(error) }; }
    results.push({ key, ...result });
    if (!result?.acknowledged || result?.timedOut) {
      return { acknowledged: false, partial: results.length > 1, results };
    }
  }
  return { acknowledged: true, partial: false, results };
}
