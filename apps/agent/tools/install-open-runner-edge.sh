#!/usr/bin/env bash
set -euo pipefail

# User-space installer for laptops and Termux. No root/systemd required.
[ "$#" -ge 3 ] || { echo "Usage: $0 DEVICE_ID QUEUE_REPO ALLOWED_AUTHOR" >&2; exit 2; }
DEVICE_ID="$1"
QUEUE_REPO="$2"
ALLOWED_AUTHOR="$3"
BASE="${THREEDVR_OPEN_RUNNER_HOME:-$HOME/.3dvr/open-runner}"

command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI (gh) is required" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated on this device" >&2; exit 1; }

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$BASE"
cp "$SRC_DIR/tools/github-open-runner.py" "$BASE/github-open-runner.py"
chmod 700 "$BASE/github-open-runner.py"
cat >"$BASE/config.json" <<JSON
{
  "queue_repo": "$QUEUE_REPO",
  "device_id": "$DEVICE_ID",
  "allowed_authors": ["$ALLOWED_AUTHOR"],
  "poll_interval_seconds": 20
}
JSON
chmod 600 "$BASE/config.json"
cat >"$BASE/run" <<EOF
#!/usr/bin/env bash
exec python3 "$BASE/github-open-runner.py" --config "$BASE/config.json"
EOF
chmod 700 "$BASE/run"

echo "Installed user-space runner at $BASE"
echo "Run: $BASE/run"
echo "For Termux boot, link this command from ~/.termux/boot/."
