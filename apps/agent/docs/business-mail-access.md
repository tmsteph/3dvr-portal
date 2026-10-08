# 3DVR business mail access

The business mailbox is `3dvr.tech@gmail.com`. The native ChatGPT Gmail connection remains a separate personal mailbox. Never silently switch accounts or duplicate outreach across the two.

## Existing connector

The authenticated 3DVR MCP gateway already provides `accounts_list`, `gmail_search`, and `gmail_read`. Its business alias is `3dvr`; credentials stay in existing server config. The app-password adapter provides read-only access. OAuth accounts use explicit registered aliases. Draft capability depends on OAuth and server configuration; this CLI never sends.

Run on Hetzner, where the gateway lives:

```sh
3dvr-mail accounts
3dvr-mail search 3dvr 'newer_than:7d -from:3dvr.tech@gmail.com'
3dvr-mail read 3dvr MESSAGE_ID
3dvr-mail read 3dvr MESSAGE_ID full
```

`3dvr mail` invokes the same client. The server entrypoint loads the existing `THREEDVR_CONFIG_FILE`; never print its contents. The OVH convenience command forwards arguments through the SSH mesh to Hetzner. No browser login, password copying, local-device access, or second native Gmail connection is needed for assistant server access.

The legacy adapter searches INBOX and returns IMAP UIDs, not Gmail API IDs. Use a UID with the same account and adapter. Gmail search syntax is forwarded to Gmail's IMAP search. Results are bounded to 25.

This does not install the custom connector into a ChatGPT session. Native custom-connector attachment is a separate client setup; do not claim it is attached because the server responds.

## Alert diagnosis and repair

On October 7, the business inbox contained repeated `Campaign stuck: quiet hours` notices, not delivery failures. The campaign scheduler emitted `quiet hours (...)` while the notification layer only recognized `outside business hours (...)`. Both phrases now defer summaries and count as expected campaign blocks. Real send and credential failures remain actionable.

The inbox monitor also alerted on arbitrary unread mail, including event invitations. Interrupt candidates now use existing business triage: contacted-lead replies and explicit public service requests. Other unread mail remains visible in triage; matched delivery failures retain their separate alert path.

Runtime worker code must be verified independently of Portal's immutable release. The observed noisy worker lives on DigitalOcean under `/root/.3dvr/portal/apps/agent`, in the existing `3dvr-autopilot` and `3dvr-inbox` tmux sessions. Do not create a duplicate worker or enable outbound outreach as part of access repair.

Validation: business mailbox IMAP authentication on OVH; authenticated gateway account listing and business-mail search on Hetzner; regression tests for both deferral phrases, inbox alert selection, and explicit read-only CLI routing.
