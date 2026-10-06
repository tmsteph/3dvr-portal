export const OPERATOR_HISTORY_KIND='3dvr-operator-shell-v1';

export function focusedMessage(messages,nodeId){
  if(!Array.isArray(messages)||!messages.length)return null;
  return messages.find(message=>message.id===nodeId)||messages.at(-1)||null;
}

export function adjacentMessageId(messages,nodeId,direction){
  if(!Array.isArray(messages)||!messages.length)return null;
  const index=Math.max(0,messages.findIndex(message=>message.id===nodeId));
  const step=direction<0?-1:1;
  const next=Math.min(messages.length-1,Math.max(0,index+step));
  return messages[next]?.id||null;
}

export function operatorHistoryState({conversationId='',nodeId='',workspaceUrl=''}={}){
  return {
    kind:OPERATOR_HISTORY_KIND,
    conversationId:String(conversationId||''),
    nodeId:String(nodeId||''),
    workspaceUrl:String(workspaceUrl||'')
  };
}

export function isOperatorHistoryState(value){
  return Boolean(value&&value.kind===OPERATOR_HISTORY_KIND);
}

export function embeddableWorkspaceHref(href,base='https://portal.3dvr.tech/operator/'){
  try{
    const url=new URL(href,base);
    return ['http:','https:'].includes(url.protocol)?url.href:'';
  }catch{
    return '';
  }
}

// Shell destinations belong to the parent chat, never to its iframe.
export function operatorShellDestination(href,base='https://portal.3dvr.tech/operator/'){
  try{
    const url=new URL(href,base);
    const parent=new URL(base);
    if(!['http:','https:'].includes(url.protocol))return '';
    const owned=url.origin===parent.origin||['portal.3dvr.tech','operator.3dvr.tech'].includes(url.hostname);
    if(!owned)return '';
    const path=url.pathname.replace(/\/+$/,'')||'/';
    if(url.hostname==='operator.3dvr.tech'||path==='/operator'||path==='/operator/index.html')return 'chat';
    return path==='/'||path==='/index.html'?'apps':'';
  }catch{return ''}
}
