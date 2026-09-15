ui = false
api_addr = "http://127.0.0.1:8200"

# 3DVR intentionally runs OpenBao as a single local control-node service.
# A non-HA backend is simpler and avoids unnecessary Raft/election failure modes.
storage "file" {
  path = "/var/lib/openbao/data"
}

listener "tcp" {
  address = "127.0.0.1:8200"
  tls_disable = 1
}

audit "file" "file" {
  description = "3DVR OpenBao audit log"
  options = {
    file_path = "/var/log/openbao/audit.log"
    log_raw = "false"
  }
}
