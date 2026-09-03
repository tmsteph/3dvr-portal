import './home-busy-state.js';
import './network-resilience.js';
import './forge-link-label.js';
import { revealDeveloperKeyButton } from './developer-key-ui.js';
import { openDatabase, loadState, saveState } from '../life-space/storage.js';
import { normalizeProspect } from '../lead-finder/core.js';

const LEADS_KEY = '3dvr.leadFinder.prospects.v1';
const GITHUB_WRITE_PATTERN = /\b(push|merge|pull request|open a pr|create a pr|commit(?: to github)?|github branch|push to github)\b/i;

async function saveLifeSpaceItem(item) {
  const db = await openDatabase();
  const state = await loadState(db) || { version:1, activeSpaceId:'space-home', spaces:[{ id:'space-home', name:'My Life', color:'#ffb66e', view:{x:0,y:0,zoom:1}, items:[], strokes:[] }], updatedAt:Date.now() };
  const space = state.spaces.find(entry => entry.id === state.activeSpaceId) || state.spaces[0];
  const offset = (space.items.length % 8) * 24;
  space.items.push({ x:40+offset, y:40+offset, w:300, h:220, color:'#fff3c9', z:Date.now(), createdAt:Date.now(), ...item });
  state.updatedAt = Date.now();
  await saveState(db, state);
}

function ownerGithubAction(action = {}, developerAccess = {}) {
  const isOwner = developerAccess?.role === 'owner'
    && Array.isArray(developerAccess?.permissions)
    && developerAccess.permissions.includes('github_write');
  if (!isOwner) return { action, isOwner:false };
  const text = String(action.text || '').trim();
  if (GITHUB_WRITE_PATTERN.test(text)) return { action, isOwner:true };
  return {
    isOwner:true,
    action:{ ...action, text:`${text} Commit and push the completed change to GitHub.`.trim() }
  };
}

function forgeFailureMessage(record = {}) {
  return String(record.error || record.resultSummary || '').trim() || 'The code edit did not complete.';
}

export async function runOperatorAction(action = {}, context = {}) {
  if (action.type === 'create_note') {
    await saveLifeSpaceItem({ id:`note-${crypto.randomUUID()}`, type:'note', title:action.title || 'New thought', text:action.text || '' });
    return { message:'Saved in Life Space.', url:'/life-space/' };
  }
  if (action.type === 'create_checklist') {
    const rows=String(action.text||'').split(/\r?\n/).map(text=>text.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).slice(0,30).map(text=>({id:`row-${crypto.randomUUID()}`,text,done:false}));
    if (!rows.length) throw new Error('At least one checklist item is required.');
    await saveLifeSpaceItem({ id:`checklist-${crypto.randomUUID()}`, type:'checklist', title:action.title || 'Things to do', text:'', rows, h:Math.min(520,170+rows.length*38), color:'#dff4ea' });
    return { message:'Saved as a checklist in Life Space.', url:'/life-space/' };
  }
  if (action.type === 'save_link') {
    let url; try { url=new URL(action.url); } catch { throw new Error('A valid link is required.'); }
    if (!['http:','https:'].includes(url.protocol)) throw new Error('Only web links can be saved.');
    await saveLifeSpaceItem({ id:`link-${crypto.randomUUID()}`, type:'link', title:action.title || url.hostname.replace(/^www\./,''), text:action.text || '', url:url.href, h:190, color:'#e8e1ff' });
    return { message:'Saved the link in Life Space.', url:'/life-space/' };
  }
  if (action.type === 'add_lead') {
    const prospect = normalizeProspect({ business:action.business, location:action.location || 'San Diego, CA', notes:action.text });
    if (!prospect) throw new Error('A business name is required.');
    let leads=[]; try { leads=JSON.parse(localStorage.getItem(LEADS_KEY)||'[]'); } catch {}
    const index=leads.findIndex(item=>String(item.business||'').toLowerCase()===prospect.business.toLowerCase()&&String(item.location||'').toLowerCase()===prospect.location.toLowerCase());
    if(index>=0) leads[index]={...leads[index],...prospect,id:leads[index].id,createdAt:leads[index].createdAt}; else leads.unshift(prospect);
    localStorage.setItem(LEADS_KEY,JSON.stringify(leads.slice(0,250)));
    return { message:`Added ${prospect.business} to Lead Finder.`, url:'/lead-finder/' };
  }
  if (action.type === 'suggest_code_change') {
    const { saveCodeSuggestion } = await import('./forge.js');
    const outcome = await saveCodeSuggestion(action);
    revealDeveloperKeyButton();
    return outcome;
  }
  if (action.type === 'request_code_change') {
    const prepared = ownerGithubAction(action, context.developerAccess);
    const { queueCodeChange } = await import('./forge.js');
    const forgeOutcome = await queueCodeChange(prepared.action);
    const { waitForForgeEdit } = await import('./forge-status.js');
    const result = await waitForForgeEdit(forgeOutcome.url);
    const status = String(result?.status || '').toLowerCase();
    if (status === 'completed') {
      return {
        ...forgeOutcome,
        message: prepared.isOwner
          ? 'Done. I applied the code change and completed the signed GitHub write.'
          : 'Done. I applied the approved code change.'
      };
    }
    if (['failed','rejected','approval_required'].includes(status)) {
      throw new Error(forgeFailureMessage(result));
    }
    return {
      ...forgeOutcome,
      message:'The code change is still running. Open the Forge edit for its live status.'
    };
  }
  if (action.type === 'open_app' && action.url) return { message:'Ready to open.', url:action.url };
  return null;
}
