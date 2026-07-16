# 3DVR Community Naming Service

## Purpose

3DVR should run a community-owned naming layer for people, projects, agents, and websites.

`selfhost.3dvr.tech` is phase zero: it proves that 3DVR can point a community-controlled name at infrastructure we operate, serve a site without Vercel, and issue HTTPS from our own edge.

The long-term goal is broader than hosting subdomains. We want a naming system that can support:

- Human-readable names for websites, agents, files, rooms, businesses, and devices.
- Community governance instead of single-vendor lock-in.
- Portable ownership records that can be resolved through DNS, the portal, agents, and local resolvers.
- A future path toward ICANN participation without blocking on ICANN from day one.

## Reality Check

There are three different layers people often call "domain names":

1. **Normal DNS under an existing domain**
   Example: `alice.3dvr.tech`.
   This works in every browser today and is the right first product.

2. **Alternative/community namespaces**
   Example: `alice.3dvr`.
   This can work through the 3DVR portal, browser extension, mobile app, local agent resolver, DNS-over-HTTPS endpoint, or gateway URL. It will not work everywhere by default unless users opt into our resolver.

3. **ICANN root / accredited registrar / new TLD**
   This is the public internet's default naming system. Becoming an ICANN-accredited registrar or operating a delegated TLD requires compliance, capital, legal process, security controls, and operational maturity. We can prepare for it, but we should not wait for it.

The pragmatic sequence is:

```text
3dvr.tech subdomain registry
  -> community registry + resolver
  -> registrar-like operations for our namespace
  -> ICANN readiness package
  -> accredited registrar or delegated TLD application when viable
```

## Phase 0: Bootstrap Proof

Status: started.

Current proof:

- `selfhost.3dvr.tech` points to the DigitalOcean host.
- Caddy serves `/var/www/3dvr-test`.
- HTTPS is handled by Caddy and Let's Encrypt.
- Vercel DNS is only being used as a temporary DNS control panel.

Next phase zero tasks:

- Move DNS management behind a 3DVR script/API instead of manual CLI calls.
- Store name records in a registry file/database.
- Generate Caddy site blocks from registry records.
- Add a public page explaining the naming experiment.

## Phase 1: 3DVR Subdomain Registry

Offer names like:

```text
alice.3dvr.tech
openwave.3dvr.tech
printshop.3dvr.tech
agent-alice.3dvr.tech
```

Minimum record shape:

```json
{
  "name": "alice",
  "fqdn": "alice.3dvr.tech",
  "owner": "oauth:user-or-org-id",
  "ownerPublicKey": "optional-ed25519-public-key",
  "targetType": "static-site",
  "target": "/var/www/names/alice",
  "status": "active",
  "createdAt": "2026-05-11T00:00:00Z",
  "updatedAt": "2026-05-11T00:00:00Z",
  "verifiedBy": ["3dvr-bootstrap"]
}
```

Core rules:

- Names are first-come, first-served unless reserved for abuse, trademarks, infrastructure, or community governance.
- Names must have a clear owner.
- Ownership changes must be auditable.
- Expiration/recovery rules must be explicit before charging money.
- External side effects such as publishing, transferring, or deleting names require an approval policy.

Initial commands:

```sh
3dvr name register alice
3dvr name deploy alice ./site
3dvr name status alice
3dvr name transfer alice user@example.com
```

## Phase 2: Community Resolver

Add non-DNS names like:

```text
alice.3dvr
openwave.3dvr
printshop.3dvr
```

Resolution paths:

- `https://3dvr.tech/n/alice`
- `https://portal.3dvr.tech/n/alice`
- local agent resolver
- browser extension
- DNS-over-HTTPS resolver
- mobile app resolver
- gateway records under `*.3dvr.tech`

The portal should be the main entry point for users who do not install anything. The local/server agent should handle advanced tasks like hosting, deployment, identity verification, and local resolver setup.

## Phase 3: Community Governance

Start with a lightweight naming council, not a DAO-first design.

Needed working groups:

- **Operations:** DNS, Caddy, hosting, uptime, backups, monitoring.
- **Protocol:** registry schema, resolver API, signed records, portability.
- **Trust and Safety:** abuse reports, phishing/malware handling, takedowns, appeals.
- **Legal and Policy:** trademark process, registrar obligations, ICANN readiness.
- **Community:** onboarding, docs, support, working sessions, partner outreach.
- **Finance:** budget, grants, sponsorships, pricing, transparent spending.

Minimum governance artifacts:

- Naming charter.
- Reserved names policy.
- Abuse policy.
- Ownership and recovery policy.
- Transparency log.
- Operator runbook.

## Phase 4: ICANN Readiness

If we want to become a true ICANN-facing service, there are two major paths:

1. **ICANN-accredited registrar**
   We sell/manage existing TLD domains like `.com`, `.org`, and `.tech`.

2. **Registry operator / new TLD applicant**
   We apply to operate a TLD such as `.3dvr` if an application window and capital are available.

Readiness work:

- Form a legal entity or partner with one.
- Build abuse response and compliance process.
- Build secure registry/registrar systems.
- Prepare data escrow, WHOIS/RDAP, DNSSEC, EPP, and audit processes if pursuing formal registrar/registry roles.
- Recruit domain industry advisors.
- Budget for application, legal, insurance, operations, and compliance.

Until that is realistic, the community namespace should be valuable on its own through subdomains, portal resolution, local resolvers, and hosting.

## People To Gather

Start with a small founding group:

- 1 DNS/web ops person.
- 1 backend/protocol engineer.
- 1 frontend/portal engineer.
- 1 legal/policy advisor familiar with domains or internet governance.
- 1 trust-and-safety/moderation lead.
- 3 to 7 early community site owners.
- 2 to 3 independent node operators.

First outreach targets:

- Indie web builders.
- Local business website owners.
- Open-source infrastructure maintainers.
- Mesh/local-first communities.
- Digital rights and internet governance people.
- Domain industry operators willing to advise.

## Resources Needed

Technical:

- At least two servers in different providers/regions.
- DNS automation access.
- Registry storage with backups.
- Caddy or another reverse proxy edge.
- Monitoring and uptime checks.
- Signed append-only log for ownership changes.
- Admin UI in portal.

Community:

- Public explainer page.
- Signup/waitlist.
- Discord/Matrix/email list.
- Monthly open call.
- Public roadmap.

Financial:

- Domain renewals.
- Server costs.
- Legal consultation.
- Abuse handling reserve.
- Future ICANN/registrar application reserve if we choose that path.

## Immediate Next Steps

1. Build `3dvr name` commands for local registry records.
2. Add a registry-backed Caddy generator.
3. Move `selfhost.3dvr.tech` into the registry as the first record.
4. Publish a page at `selfhost.3dvr.tech` explaining the experiment.
5. Create a public invite: "Help build a community-run naming layer for 3DVR."
6. Recruit five early namespace users and two backup node operators.
7. Start documenting what would be required for ICANN registrar or TLD readiness.

