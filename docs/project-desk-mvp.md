# 3DVR Project Desk MVP

The canonical MVP brief lives in the 3DVR web app docs:

- `3dvr-web/docs/project-desk-mvp.md`
- GitHub path: `tmsteph/3dvr-web/docs/project-desk-mvp.md`

## Portal Relationship

3DVR Project Desk is planned as a managed web-presence product for small projects. The first implementation target is
the 3DVR web app, where slug-based public project pages such as `/sddt`, `/sddt/contact`, `/sddt/book`, and `/sddt/pay`
can be built from project records.

The portal may later own or integrate with:

- Cross-project admin controls
- Customer/account identity
- Payment and subscription status
- Support queues
- Agent approval queues
- Client dashboards

Do not build those portal-side integrations until the web MVP is working with mock or database-backed project records.

## MVP Boundary

For now, keep Project Desk small:

- Manual project records
- Public project pages
- Contact requests
- Booking requests
- Payment link display
- Simple admin dashboard

Do not build full email hosting, real mailboxes, Stripe Connect, AI auto replies, calendar sync, or complex CRM behavior
in the first pass.

## Implementation Note

If future portal work needs Project Desk context, start with the web spec and preserve the same constraint:

> Prefer simple working code over abstract architecture.
