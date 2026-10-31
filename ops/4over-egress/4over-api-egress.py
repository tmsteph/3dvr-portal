#!/usr/bin/env python3
"""Route only the OVH browser user's 4over api TLS connection over its SSH mesh."""
import ipaddress,json,os,socket,subprocess,sys
from pathlib import Path
HOST="mapi.4over.com"
PORT="18445"
STATE=Path("/run/3dvr-4over-api-egress.json")
COMMENT="3dvr-4over-api-egress"
def run(args,check=True):
    return subprocess.run(args,check=check,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def rule(ip,uid):
    return ["-p","tcp","-d",ip+"/32","--dport","443","-m","owner","--uid-owner",str(uid),"-m","comment","--comment",COMMENT,"-j","DNAT","--to-destination","127.0.0.1:"+PORT]
def remove():
    if not STATE.exists(): return
    state=json.loads(STATE.read_text())
    args=rule(state["ip"],state["uid"])
    for _ in range(3):
        if run(["iptables","-t","nat","-C","OUTPUT",*args],False).returncode: break
        run(["iptables","-t","nat","-D","OUTPUT",*args])
    STATE.unlink(missing_ok=True)
if sys.argv[1]=="remove": remove()
elif sys.argv[1]=="add":
    uid=int(sys.argv[2])
    if uid!=1000: raise SystemExit("Unexpected canonical browser uid")
    remove()
    ip=socket.getaddrinfo(HOST,443,socket.AF_INET,socket.SOCK_STREAM)[0][4][0]
    if not ipaddress.ip_address(ip).is_global: raise SystemExit("Refusing non-public target address")
    args=rule(ip,uid)
    run(["iptables","-t","nat","-I","OUTPUT","1",*args])
    STATE.write_text(json.dumps({"host":HOST,"ip":ip,"uid":uid}))
    os.chmod(STATE,0o600)
else: raise SystemExit("Expected add UID or remove")
