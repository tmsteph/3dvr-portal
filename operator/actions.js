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

export async function watchOperatorActionOutcome(outcome = {}, handlers = {}) {
  const background = outcome?.backgroundTask;
  if (!background?.kind) return () => {};
  const onStatus = typeof handlers.onStatus === 'function' ? handlers.onStatus : () => {};
  const onUpdate = typeof handlers.onUpdate === 'function' ? handlers.onUpdate : () => {};

  if (background.kind === 'operator_runtime') {
    const runtime = await import('./delegate-task.js');
    return runtime.watchOperatorTask(background.id, {
      onUpdate: record => {
        const terminal = runtime.isOperatorTaskTerminal(record);
        const progress = runtime.operatorTaskProgress(record, background.estimateMs);
        onStatus(progress);
        onUpdate({
          terminal,
          status: String(record.status || 'queued'),
          message: terminal ? runtime.operatorTaskReceipt(record) : progress,
          record
        });
      }
    });
  }

  if (background.kind === 'server_control') {
    const server = await import('./server-control.js');
    return server.watchServerControlRequest(background.id, {
      onUpdate: record => {
        const terminal = server.isServerControlTerminal(record);
        const progress = server.serverControlProgress(record);
        onStatus(progress);
        onUpdate({
          terminal,
          status: String(record.status || 'queued'),
          message: terminal ? server.serverControlReceipt(record) : progress,
          record
        });
      }
    });
  }

  if (background.kind === 'forge') {
    const forge = await import('./forge-status.js');
    return forge.watchForgeEdit(background.value, {
      onUpdate: record => {
        const terminal = forge.isForgeEditTerminal(record);
        const progress = forge.forgeEditProgress(record);
        onStatus(progress);
        onUpdate({
          terminal,
          status: String(record.status || 'queued'),
          message: terminal ? forge.forgeEditReceipt(record) : progress,
          record
        });
      }
    });
  }

  return () => {};
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
  if (action.type === 'delegate_task') {
    context.onStatus?.('Delegating to Operator Runtime…');
    const { queueOperatorTask } = await import('./delegate-task.js');
    const outcome = await queueOperatorTask(action);
    const estimateMinutes = Math.max(1, Math.ceil(Number(outcome.estimateMs || 120_000) / 60_000));
    context.onStatus?.(`Queued · runtime budget ≤${estimateMinutes}m`);
    return {
      ...outcome,
      message: `${outcome.message} Runtime budget ≤${estimateMinutes}m. I’ll keep this chat updated.`,
      backgroundTask: { kind:'operator_runtime', id:outcome.taskId, estimateMs:outcome.estimateMs || 120_000 }
    };
  }
  if (action.type === 'server_control') {
    context.onStatus?.('Queueing the server request…');
    const { queueServerControl } = await import('./server-control.js');
    const outcome = await queueServerControl(action);
    context.onStatus?.('Server request queued · waiting for the control worker');
    return {
      ...outcome,
      message: `${outcome.message} I’ll keep this chat updated.`,
      backgroundTask: { kind:'server_control', id:outcome.requestId }
    };
  }
  if (action.type === 'request_code_change') {
    context.onStatus?.('Queueing the approved code edit…');
    const prepared = ownerGithubAction(action, context.developerAccess);
    const { queueCodeChange } = await import('./forge.js');
    const forgeOutcome = await queueCodeChange(prepared.action);
    const { waitForForgeEdit, forgeEditProgress, forgeEditReceipt } = await import('./forge-status.js');
    context.onStatus?.('Code edit queued · waiting for Forge');
    const result = await waitForForgeEdit(forgeOutcome.url, {
      timeoutMs: 12_000,
      onUpdate: record => context.onStatus?.(forgeEditProgress(record))
    });
    const status = String(result?.status || '').toLowerCase();
    if (status === 'completed') {
      return {
        ...forgeOutcome,
        message: forgeEditReceipt(result)
      };
    }
    if (['failed','rejected','approval_required'].includes(status)) {
      throw new Error(forgeFailureMessage(result));
    }
    return {
      ...forgeOutcome,
      message: `${forgeEditReceipt(result)} ${forgeEditProgress(result)} I’ll keep this chat updated.`.trim(),
      backgroundTask: { kind:'forge', value:forgeOutcome.url }
    };
  }
  if (action.type === 'open_app' && action.url) return { message:'Ready to open.', url:action.url };
  return null;
}