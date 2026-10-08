import { normalizeLead } from './model.js';
const text = value => String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const field = (item, name) => text(item.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i'))?.[1]);
export function parseJobFeed(xml, now = Date.now()) {
  const leads = [];
  for (const item of String(xml).match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || []) {
    const title = field(item, 'title');
    const sourceUrl = field(item, 'link');
    const sourceDate = field(item, 'pubDate');
    const posted = Date.parse(sourceDate);
    if (!/^https:\/\/community\.n8n\.io\/t\//.test(sourceUrl)) continue;
    if (!Number.isFinite(posted) || now - posted > 30 * 86400000 || posted > now + 86400000) continue;
    if (/for hire|available for|offering|my services|portfolio|looking for.*work|seeking.*work|job seeker|\[offer\]/i.test(title)) continue;
    if (!/hiring|looking for.*(developer|engineer|expert|specialist|help)|seeking.*(developer|engineer|expert|specialist)|need.*(help|developer|engineer|expert)|wanted|hire/i.test(title)) continue;
    leads.push(normalizeLead({
      business: title, problem: title, sourceUrl, sourceDate: new Date(posted).toISOString(),
      evidence: (title + ' — ' + field(item, 'description')).slice(0, 3000),
      origin: 'n8n-jobs', intent: 'partial', budget: 'undecided',
      nextAction: 'Read the buyer post; verify business, active demand, budget and authority.',
      nextDate: new Date(now).toISOString().slice(0, 10)
    }));
    if (leads.length >= 20) break;
  }
  return leads;
}
export async function collectJobs(store, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl('https://community.n8n.io/c/jobs/13.rss', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('The public hiring feed is unavailable.');
  const xml = await response.text();
  if (xml.length > 2000000) throw new Error('Hiring feed exceeded the size limit.');
  const leads = parseJobFeed(xml);
  let added = 0;
  for (const lead of leads) if (!store.insert(lead).duplicate) added++;
  return { reviewed: leads.length, added, source: 'n8n community Jobs', checkedAt: new Date().toISOString() };
}
