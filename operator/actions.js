import { openDatabase, loadState, saveState } from '../life-space/storage.js';
import { normalizeProspect } from '../lead-finder/core.js';

const LEADS_KEY = '3dvr.leadFinder.prospects.v1';

export async function runOperatorAction(action = {}) {
  if (action.type === 'create_note') {
    const db = await openDatabase();
    const state = await loadState(db) || { version:1, activeSpaceId:'space-home', spaces:[{ id:'space-home', name:'My Life', color:'#ffb66e', view:{x:0,y:0,zoom:1}, items:[], strokes:[] }], updatedAt:Date.now() };
    const space = state.spaces.find(item => item.id === state.activeSpaceId) || state.spaces[0];
    space.items.push({ id:`note-${crypto.randomUUID()}`, type:'note', x:40, y:40, w:300, h:220, title:action.title || 'New thought', text:action.text || '', color:'#fff3c9', z:Date.now(), createdAt:Date.now() });
    state.updatedAt = Date.now(); await saveState(db, state);
    return { message:'Saved in Life Space.', url:'/life-space/' };
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
  if (action.type === 'open_app' && action.url) return { message:'Ready to open.', url:action.url };
  return null;
}
