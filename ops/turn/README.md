# 3DVR TURN Relay

TURN gives WebRTC a fallback media path when peers cannot connect directly through NAT, carrier NAT,
or restrictive Wi-Fi. The WebRTC lab uses `/api/session?route=turn-credentials` to mint short-lived credentials
for a coturn server configured with the same shared secret.

## Server Setup

1. Create a small VPS near your users. A 1 vCPU / 1 GB server is enough for testing.
2. Point `turn.3dvr.tech` at the VPS public IP.
3. Open firewall ports:
   - `3478/tcp`
   - `3478/udp`
   - `5349/tcp`
   - `49152-65535/udp`
4. Install Docker and Docker Compose.
5. Copy `turnserver.conf.example` to `turnserver.conf`.
6. Replace `static-auth-secret` with a long random value:

   ```bash
   openssl rand -hex 32
   ```

7. Use the same value in Vercel as `TURN_STATIC_AUTH_SECRET`.
8. If using `turns:` URLs, install a certificate for `turn.3dvr.tech`:

   ```bash
   sudo certbot certonly --standalone -d turn.3dvr.tech
   ```

9. Start coturn:

   ```bash
   docker compose up -d
   ```

## Portal Environment

Set these Vercel env vars for the portal deployment:

```bash
TURN_URLS=turn:turn.3dvr.tech:3478?transport=udp,turn:turn.3dvr.tech:3478?transport=tcp,turns:turn.3dvr.tech:5349?transport=tcp
TURN_REALM=turn.3dvr.tech
TURN_STATIC_AUTH_SECRET=<same secret as coturn static-auth-secret>
TURN_TTL_SECONDS=3600
TURN_USERNAME_PREFIX=portal
```

Deploy the portal after setting the env vars. The WebRTC lab should then show `Relay: TURN ready`.
Use `?relay=1` or `?ice=relay` on a room URL to force TURN-only testing.

The current 3DVR test relay runs on the DigitalOcean server at `167.172.193.194` and is exposed through
`selfhost.3dvr.tech`/`turn.3dvr.tech`. For mobile carrier testing, keep the relay UDP range wide enough
for real calls and avoid blocking private or carrier-grade NAT peer ranges in coturn until the behavior is
well understood; overly strict `denied-peer-ip` rules can make same-network calls work while 5G calls fail.
