(() => {
  const PROFILE_KEY='3dvr.digitalTwin.profile.v1';
  const OPERATOR_PREFILL_KEY='3dvr.operator.prefill.v1';
  const form=document.querySelector('#twin-chat-form');
  const input=document.querySelector('#twin-chat');
  const mode=document.querySelector('#twin-mode');
  const identityStatus=document.querySelector('#identity-status');
  const identityDetail=document.querySelector('#identity-detail');
  const policyStatus=document.querySelector('#policy-status');
  const policyControls=[...document.querySelectorAll('[data-policy]')];

  window.AuthIdentity?.syncStorageFromSharedIdentity?.(localStorage);

  function readProfile(){try{return JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}')||{}}catch{return{}}}
  function saveProfile(next){localStorage.setItem(PROFILE_KEY,JSON.stringify({version:1,updatedAt:new Date().toISOString(),...next}))}

  function paintIdentity(){
    const shared=window.AuthIdentity?.readSharedIdentity?.()||{};
    const signedIn=localStorage.getItem('signedIn')==='true';
    const label=String(shared.alias||localStorage.getItem('alias')||'').trim();
    if(signedIn||label){
      mode.textContent='Personal twin';
      identityStatus.textContent=label||'Signed in';
      identityDetail.textContent='Conversation and account context can follow this identity across supported 3DVR surfaces.';
      return;
    }
    mode.textContent='Local twin';
    identityStatus.textContent='This device';
    identityDetail.innerHTML='Your settings work locally now. <a href="/auth/sign-in.html">Sign in</a> for shared identity and sync.';
  }

  function loadPolicies(){
    const policies=readProfile().policies||{};
    policyControls.forEach(control=>{if(policies[control.dataset.policy])control.value=policies[control.dataset.policy]});
  }

  function storePolicies(showReceipt=true){
    const profile=readProfile();
    const policies=Object.fromEntries(policyControls.map(control=>[control.dataset.policy,control.value]));
    saveProfile({...profile,policies});
    if(showReceipt){
      policyStatus.textContent='Saved for this twin.';
      window.setTimeout(()=>{policyStatus.textContent=''},2200);
    }
  }

  function openOperator(prompt){
    const clean=String(prompt||'').trim();
    if(!clean){input.focus();return}
    sessionStorage.setItem(OPERATOR_PREFILL_KEY,JSON.stringify({prompt:clean,submit:true,source:'/digital-twin/',createdAt:Date.now()}));
    const params=new URLSearchParams({from:'/digital-twin/',title:'3DVR Digital Twin',heading:'Your Digital Twin'});
    window.location.assign('/operator/?'+params.toString());
  }

  form.addEventListener('submit',event=>{event.preventDefault();openOperator(input.value)});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-command]');if(button)openOperator(button.dataset.command)});
  document.querySelector('#save-policy').addEventListener('click',()=>storePolicies(true));
  policyControls.forEach(control=>control.addEventListener('change',()=>storePolicies(false)));

  paintIdentity();
  loadPolicies();
})();
