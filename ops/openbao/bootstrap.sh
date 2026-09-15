#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo 'Run as root.' >&2; exit 2; }
umask 077
export BAO_ADDR="${BAO_ADDR:-http://127.0.0.1:8200}"
BOOTSTRAP_DIR=${THREEDVR_OPENBAO_BOOTSTRAP_DIR:-/root/.3dvr/openbao-bootstrap}
RECOVERY_DIR=${THREEDVR_OPENBAO_RECOVERY_DIR:-/root/.3dvr/openbao-recovery}
BROKER_DIR=${THREEDVR_OPENBAO_BROKER_DIR:-/etc/3dvr/openbao}
BWS_ENV=${THREEDVR_BWS_ENV:-/etc/3dvr/secrets-broker/bitwarden.env}
POLICY_FILE=${THREEDVR_SECRETS_BROKER_POLICY:-/etc/3dvr/secrets-broker/policy.json}
MIGRATOR=${THREEDVR_OPENBAO_MIGRATOR:-/usr/local/lib/3dvr/migrate-bws-to-openbao.mjs}
MESH_KEY=${THREEDVR_MESH_KEY:-/home/debian/.ssh/id_ed25519_3dvr_mesh}
DO_HOST=${THREEDVR_DO_HOST:-167.172.193.194}
HETZNER_HOST=${THREEDVR_HETZNER_HOST:-167.233.174.20}

getent group threedvr-secrets >/dev/null || { echo 'threedvr-secrets group is required.' >&2; exit 2; }
mkdir -p "$BOOTSTRAP_DIR" "$RECOVERY_DIR" "$BROKER_DIR"
chmod 0700 "$BOOTSTRAP_DIR" "$RECOVERY_DIR"

status_json=$(bao status -format=json 2>/dev/null || true)
initialized=$(printf '%s' "$status_json" | jq -r '.initialized // false')
if [ "$initialized" != true ]; then
  bao operator init -key-shares=3 -key-threshold=2 -format=json > "$BOOTSTRAP_DIR/init.json"
  chmod 0600 "$BOOTSTRAP_DIR/init.json"
  echo 'OpenBao initialized.'
fi

INIT_FILE="$BOOTSTRAP_DIR/init.json"
[ -s "$INIT_FILE" ] || { echo "Missing bootstrap material: $INIT_FILE" >&2; exit 3; }

submit_unseal_key() {
  local index=$1
  jq -c --argjson i "$index" '{key:.unseal_keys_b64[$i]}' "$INIT_FILE" \
    | curl -fsS -H 'content-type: application/json' --data-binary @- "$BAO_ADDR/v1/sys/unseal" >/dev/null
}

sealed=$(bao status -format=json 2>/dev/null | jq -r '.sealed // true' || echo true)
if [ "$sealed" = true ]; then
  submit_unseal_key 0
  submit_unseal_key 1
fi
sealed=$(bao status -format=json 2>/dev/null | jq -r '.sealed // true' || echo true)
[ "$sealed" = false ] || { echo 'OpenBao failed to unseal.' >&2; exit 4; }

export BAO_TOKEN
BAO_TOKEN=$(jq -r '.root_token' "$INIT_FILE")
[ -n "$BAO_TOKEN" ] && [ "$BAO_TOKEN" != null ] || { echo 'Bootstrap token missing.' >&2; exit 5; }

if ! bao secrets list -format=json | jq -e 'has("kv/")' >/dev/null; then
  bao secrets enable -path=kv -version=2 kv >/dev/null
fi
if ! bao auth list -format=json | jq -e 'has("approle/")' >/dev/null; then
  bao auth enable approle >/dev/null
fi

install -d -o openbao -g openbao -m 0750 /var/log/openbao
touch /var/log/openbao/audit.log
chown openbao:openbao /var/log/openbao/audit.log
chmod 0600 /var/log/openbao/audit.log
if ! bao audit list -format=json | jq -e 'has("file/")' >/dev/null; then
  bao audit enable file file_path=/var/log/openbao/audit.log >/dev/null
fi

cat > "$BROKER_DIR/broker-policy.hcl" <<'HCL'
path "kv/data/runtime/by-key/*" { capabilities = ["create", "update", "read"] }
path "kv/metadata/runtime/by-key/*" { capabilities = ["read", "list"] }
path "kv/data/runtime/by-id/*" { capabilities = ["create", "update", "read"] }
path "kv/metadata/runtime/by-id/*" { capabilities = ["read", "list"] }
HCL
cat > "$BROKER_DIR/operator-policy.hcl" <<'HCL'
path "kv/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "sys/mounts" { capabilities = ["read"] }
path "sys/mounts/*" { capabilities = ["create", "read", "update", "delete"] }
path "sys/auth" { capabilities = ["read"] }
path "sys/auth/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "sys/policies/acl" { capabilities = ["list"] }
path "sys/policies/acl/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "auth/approle/role/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "sys/audit" { capabilities = ["read"] }
path "sys/audit/*" { capabilities = ["create", "read", "update", "delete"] }
HCL
chown root:threedvr-secrets "$BROKER_DIR/broker-policy.hcl"
chmod 0640 "$BROKER_DIR/broker-policy.hcl"
chmod 0600 "$BROKER_DIR/operator-policy.hcl"

bao policy write 3dvr-broker "$BROKER_DIR/broker-policy.hcl" >/dev/null
bao policy write 3dvr-operator "$BROKER_DIR/operator-policy.hcl" >/dev/null
bao write auth/approle/role/3dvr-broker \
  token_policies=3dvr-broker token_ttl=15m token_max_ttl=1h \
  secret_id_ttl=0 secret_id_num_uses=0 >/dev/null
bao write auth/approle/role/3dvr-operator \
  token_policies=3dvr-operator token_ttl=20m token_max_ttl=2h \
  secret_id_ttl=0 secret_id_num_uses=0 >/dev/null

bao read -field=role_id auth/approle/role/3dvr-broker/role-id > "$BROKER_DIR/broker-role-id"
bao write -f -field=secret_id auth/approle/role/3dvr-broker/secret-id > "$BROKER_DIR/broker-secret-id"
chown root:threedvr-secrets "$BROKER_DIR/broker-role-id" "$BROKER_DIR/broker-secret-id"
chmod 0640 "$BROKER_DIR/broker-role-id" "$BROKER_DIR/broker-secret-id"

bao read -field=role_id auth/approle/role/3dvr-operator/role-id > "$RECOVERY_DIR/operator-role-id"
bao write -f -field=secret_id auth/approle/role/3dvr-operator/secret-id > "$RECOVERY_DIR/operator-secret-id"
chmod 0600 "$RECOVERY_DIR/operator-role-id" "$RECOVERY_DIR/operator-secret-id"

[ -s "$BWS_ENV" ] || { echo "Missing BWS environment: $BWS_ENV" >&2; exit 6; }
[ -f "$MIGRATOR" ] || { echo "Missing migration utility: $MIGRATOR" >&2; exit 7; }
set -a
. "$BWS_ENV"
set +a
migration=$(node "$MIGRATOR")
printf '%s' "$migration" | jq -e '.ok == true and .migrated >= 1' >/dev/null
printf 'Migrated %s runtime secrets.\n' "$(printf '%s' "$migration" | jq -r .migrated)"

# Prove the broker AppRole can resolve a real migrated locator before changing policy.
node - "$POLICY_FILE" <<'NODE'
const fs = require('fs');
const { OpenBaoBackend } = require('/opt/3dvr/secrets-broker/openbao');
const policy = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const candidate = Object.values(policy.secrets || {}).find(item => (
  item?.backend === 'bitwarden'
  && item?.locator
  && (item.locator.key || item.locator.id || item.locator.secretId)
));
if (!candidate) throw new Error('No direct secret locator is available for OpenBao verification');
const value = new OpenBaoBackend().get(candidate.locator);
if (typeof value !== 'string' || !value) throw new Error('OpenBao verification returned an empty value');
NODE

cp -a "$POLICY_FILE" "$POLICY_FILE.pre-openbao"
tmp=$(mktemp)
jq '
  .backends.openbao = {"type":"openbao"}
  | .secrets |= with_entries(if .value.backend == "bitwarden" then .value.backend = "openbao" else . end)
' "$POLICY_FILE" > "$tmp"
install -o root -g threedvr-secrets -m 0640 "$tmp" "$POLICY_FILE"
rm -f "$tmp"

jq -r '.unseal_keys_b64[0]' "$INIT_FILE" > "$RECOVERY_DIR/ovh-share-1"
chmod 0600 "$RECOVERY_DIR/ovh-share-1"

copy_share() {
  local index=$1 host=$2 dest=$3
  jq -r --argjson i "$index" '.unseal_keys_b64[$i]' "$INIT_FILE" \
    | sudo -H -u debian ssh -i "$MESH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 "root@$host" \
      "umask 077; mkdir -p /root/.3dvr/openbao-recovery; cat > '$dest'; chmod 600 '$dest'"
}
copy_share 1 "$DO_HOST" /root/.3dvr/openbao-recovery/ovh-share-2
copy_share 2 "$HETZNER_HOST" /root/.3dvr/openbao-recovery/ovh-share-3

systemctl restart 3dvr-secrets-broker.service
sleep 1
health=$(curl -fsS --unix-socket /run/3dvr-secrets-broker/broker.sock http://localhost/health)
printf '%s' "$health" | jq -e '.ok == true and .openbao == true' >/dev/null

bao token revoke -self >/dev/null
unset BAO_TOKEN BWS_ACCESS_TOKEN
shred -u "$INIT_FILE" 2>/dev/null || rm -f "$INIT_FILE"
echo 'OpenBao bootstrap complete; Bitwarden remains configured only as rollback/recovery.'
