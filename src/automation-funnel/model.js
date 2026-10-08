export const STAGES = ['discovered', 'qualified', 'contacted', 'replied', 'diagnostic-paid', 'proposal', 'project-paid', 'accepted', 'support', 'lost', 'deferred', 'do-not-contact'];
export const BUDGETS = ['under-200', '200-599', '600-1499', '1500-plus', 'undecided'];
export const clean = (value, limit = 1000) => String(value || '').trim().slice(0, limit);
export function scoreLead(lead) {
  const signals = {
    intent: lead.intent === 'explicit' ? 2 : lead.intent === 'partial' ? 1 : 0,
    budget: BUDGETS.slice(1, 4).includes(lead.budget) ? 2 : lead.budget === 'under-200' ? 1 : 0,
    problem: lead.problem && lead.impact ? 2 : lead.problem ? 1 : 0,
    authority: lead.authority === 'yes' ? 2 : lead.authority === 'involved' ? 1 : 0,
    readiness: lead.timeline === 'this-month' && lead.stack ? 2 : lead.timeline === 'later' || lead.stack ? 1 : 0
  };
  const score = Object.values(signals).reduce((sum, n) => sum + n, 0);
  const qualified = signals.intent === 2 && signals.budget === 2 && signals.authority === 2 && score >= 8;
  return { signals, score, qualified, priority: qualified ? 'ready' : score >= 5 ? 'clarify' : 'research' };
}
export function normalizeLead(input, { inbound = false } = {}) {
  const lead = {};
  for (const key of ['name', 'business', 'email', 'problem', 'impact', 'stack', 'sourceUrl', 'evidence', 'nextAction', 'nextDate', 'notes', 'paymentReference']) {
    lead[key] = clean(input[key], ['problem', 'impact', 'evidence', 'notes'].includes(key) ? 3000 : 500);
  }
  lead.email = lead.email.toLowerCase();
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) throw new Error('Enter a valid email address.');
  if (lead.sourceUrl && !/^https?:\/\//i.test(lead.sourceUrl)) throw new Error('Source must be an http or https link.');
  if (lead.nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(lead.nextDate)) throw new Error('Choose a valid follow-up date.');
  lead.budget = BUDGETS.includes(input.budget) ? input.budget : 'undecided';
  lead.authority = ['yes', 'involved', 'no'].includes(input.authority) ? input.authority : 'no';
  lead.timeline = ['this-month', 'later', 'undecided'].includes(input.timeline) ? input.timeline : 'undecided';
  lead.intent = inbound ? 'explicit' : ['explicit', 'partial', 'unknown'].includes(input.intent) ? input.intent : 'unknown';
  lead.consent = inbound ? input.consent === true : input.consent === true;
  lead.origin = inbound ? 'inbound' : clean(input.origin || 'manual', 80);
  lead.sourceDate = clean(input.sourceDate, 80);
  lead.stage = inbound ? 'discovered' : STAGES.includes(input.stage) ? input.stage : 'discovered';
  lead.revenue = Math.max(0, Number(input.revenue) || 0);
  lead.hours = Math.max(0, Number(input.hours) || 0);
  if (!Number.isFinite(lead.revenue) || !Number.isFinite(lead.hours)) throw new Error('Enter valid revenue and hours.');
  if (inbound) {
    if (!lead.name || !lead.business || !lead.email || !lead.problem || !lead.consent) throw new Error('Complete the required fields and agree to a reply about your inquiry.');
    lead.nextAction = 'Review inquiry and confirm scope for a $200 diagnostic.';
    lead.nextDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    lead.evidence = 'Buyer submitted an automation inquiry. Budget, authority and timeline are self-reported.';
    lead.notes = '';
    lead.paymentReference = '';
    lead.revenue = 0;
    lead.hours = 0;
  }
  if (!lead.business || !lead.problem) throw new Error('Business and automation problem are required.');
  const qualification = scoreLead(lead);
  if (inbound && qualification.qualified) lead.stage = 'qualified';
  if (lead.stage === 'qualified' && !qualification.qualified) throw new Error('Confirm intent, approved budget, authority and readiness before qualifying.');
  if (['diagnostic-paid', 'project-paid'].includes(lead.stage) && !lead.paymentReference) throw new Error('Record a verified payment reference before marking paid.');
  return { ...lead, ...qualification };
}
export function draftReply(lead) {
  if (['do-not-contact', 'lost'].includes(lead.stage)) throw new Error('This lead is not available for outreach.');
  const name = clean(lead.name, 100) || 'there';
  return {
    subject: 'Help with your automation workflow',
    body: 'Hi ' + name + ',\n\n' +
      (lead.origin === 'inbound' ? 'Thanks for telling us what you want to automate. ' : 'I saw your request for automation help. ') +
      'I help business owners finish workflows and make them dependable. Your priority is: ' + clean(lead.problem, 240) + '.\n\n' +
      (lead.qualified
        ? 'We can start with a $200 diagnostic of one workflow, capped at two hours, with findings and a separate implementation quote. Would that fit your needs?'
        : 'Which workflow is the priority, and what budget is approved to get it working?') +
      '\n\nThomas Stephens\n3DVR · 3dvr.tech@gmail.com'
  };
}
