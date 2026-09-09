# Tom Butcher Phase 1 control

Purpose: read-only access validation and audit orchestration for the authorized Butcher Law Office n8n Phase 1 review.

Safety constraints:
- no configuration changes on the target host
- no firewall changes
- no Docker restarts or edits
- no credential copying into GitHub
- use the existing private key already present on the authorized OVH worker
- stop before Phase 2 until Tom gives explicit go-ahead

Target account: tstephens@178.105.247.138
