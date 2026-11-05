#!/usr/bin/env python3
"""Bounded Portal DNS operations using the server's existing Vercel CLI session."""
import json, pathlib, subprocess, sys, urllib.request, os, time
DOMAIN = '3dvr.tech'
TEAM = 'team_KXuVUd00RMnDsjoqwdREcZ7J'
STATE = pathlib.Path('/root/.3dvr/deploy/portal-dns-20261002')
STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
action = sys.argv[1]
subprocess.run(['/root/.openclaw/tools/node/bin/vercel', 'whoami'], check=True, capture_output=True, timeout=30)
auth = json.loads(pathlib.Path('/root/.local/share/com.vercel.cli/auth.json').read_text())
def api(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request('https://api.vercel.com'+path+'?teamId='+TEAM, data=body,
        headers={'Authorization':'Bearer '+auth['token'], 'Content-Type':'application/json'}, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}
def records():
    return api('GET', '/v5/domains/'+DOMAIN+'/records')['records']
def save(name, value):
    path = STATE/name
    with open(path, 'x', opener=lambda p,f: os.open(p,f,0o600)) as stream: json.dump(value,stream)
if action == 'backup':
    data = records()
    if not (STATE/'before.json').exists(): save('before.json',data)
    print(json.dumps({'ok':True,'records':len(data)}))
elif action == 'add':
    value = json.load(sys.stdin)['validation']
    result = api('POST','/v2/domains/'+DOMAIN+'/records',
        {'name':'_acme-challenge.portal','type':'TXT','value':value,'ttl':60})
    print(json.dumps({'id':result.get('uid') or result.get('id')}))
elif action == 'cleanup':
    record_id = json.load(sys.stdin)['id']
    live = [r for r in records() if r['id']==record_id and r['name']=='_acme-challenge.portal' and r['type']=='TXT']
    if len(live)!=1: raise RuntimeError('Challenge record identity mismatch')
    api('DELETE','/v2/domains/'+DOMAIN+'/records/'+record_id)
    print(json.dumps({'ok':True}))
elif action == 'switch':
    original = [r for r in json.loads((STATE/'before.json').read_text()) if r['name']=='portal']
    live = [r for r in records() if r['name']=='portal' and r['type'] in ['A','AAAA','CNAME','ALIAS']]
    if len(original)!=1 or len(live)!=1 or live[0]['id']!=original[0]['id']: raise RuntimeError('Portal DNS changed since backup')
    if live[0]['type']!='CNAME' or live[0]['value']!='cname.vercel-dns.com.': raise RuntimeError('Unexpected origin')
    api('DELETE','/v2/domains/'+DOMAIN+'/records/'+live[0]['id'])
    try:
        result=api('POST','/v2/domains/'+DOMAIN+'/records',{'name':'portal','type':'A','value':'40.160.137.41','ttl':60})
    except Exception:
        api('POST','/v2/domains/'+DOMAIN+'/records',{k:original[0][k] for k in ['name','type','value','ttl']})
        raise
    save('new-address.json',{'id':result.get('uid') or result.get('id')})
    api('POST','/v2/domains/'+DOMAIN+'/records',{'name':'portal','type':'CAA','value':'0 issue "letsencrypt.org"','ttl':60})
    print(json.dumps({'ok':True,'portal':[r for r in records() if r['name']=='portal']}))
elif action == 'rollback':
    original = [r for r in json.loads((STATE/'before.json').read_text()) if r['name']=='portal'][0]
    live = [r for r in records() if r['name']=='portal']
    for r in live:
        if r['type']=='CAA' and r['value']=='0 issue "letsencrypt.org"':
            api('DELETE','/v2/domains/'+DOMAIN+'/records/'+r['id'])
    address=json.loads((STATE/'new-address.json').read_text())
    matches=[r for r in records() if r['id']==address['id'] and r['type']=='A' and r['value']=='40.160.137.41']
    if len(matches)!=1:raise RuntimeError('Rollback address identity mismatch')
    api('DELETE','/v2/domains/'+DOMAIN+'/records/'+address['id'])
    api('POST','/v2/domains/'+DOMAIN+'/records',{k:original[k] for k in ['name','type','value','ttl']})
    print(json.dumps({'ok':True}))
else:
    raise RuntimeError('Unknown action')
