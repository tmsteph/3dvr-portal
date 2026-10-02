#!/usr/bin/env python3
"""Certbot DNS hook; credentials remain in the existing Hetzner CLI session."""
import json, os, pathlib, subprocess, sys, time
if os.environ.get('CERTBOT_DOMAIN')!='portal.3dvr.tech':
    raise RuntimeError('Unexpected certificate domain')
ssh = ['ssh','-o','BatchMode=yes','-o','ConnectTimeout=8',
       '-o','UserKnownHostsFile=/home/debian/.ssh/known_hosts',
       '-i','/home/debian/.ssh/id_ed25519_3dvr_mesh','root@167.233.174.20']
action=sys.argv[1]
state=pathlib.Path('/var/lib/letsencrypt/portal-3dvr-challenge.json')
def remote(action, data):
    result=subprocess.run(ssh+['python3 /root/.3dvr/deploy/portal-dns-20261002.py '+action],
        input=json.dumps(data),text=True,capture_output=True,timeout=60,check=True)
    return json.loads(result.stdout)
if action=='auth':
    validation=os.environ['CERTBOT_VALIDATION']
    result=remote('add',{'validation':validation})
    if not result.get('id'):raise RuntimeError('DNS record id missing')
    state.write_text(json.dumps(result));state.chmod(0o600)
    for attempt in range(24):
        checks=[]
        for resolver in ['ns1.vercel-dns.com','1.1.1.1','8.8.8.8']:
            value=subprocess.check_output(['dig','+short','+time=2','+tries=1','@'+resolver,
                'TXT','_acme-challenge.portal.3dvr.tech'],text=True,timeout=5)
            checks.append(validation in value)
        if all(checks):break
        time.sleep(5)
    else:
        remote('cleanup',result)
        raise RuntimeError('DNS challenge did not propagate')
    print(json.dumps(result))
elif action=='cleanup':
    result=json.loads(os.environ.get('CERTBOT_AUTH_OUTPUT') or state.read_text())
    print(json.dumps(remote('cleanup',result)))
    state.unlink(missing_ok=True)
else:raise RuntimeError('Unknown hook action')
