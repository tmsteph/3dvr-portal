# No-Account Stripe Payment Plan

This document captures the current billing simplification plan. It is planning documentation only; it does not replace the current portal account billing flow yet.

## Goal

Make it possible for someone to pay 3DVR without creating a portal account first.

The simpler path should be:

> See plan -> Pay in Stripe -> Get receipt -> Optional portal setup

This lowers friction for friends, family, small customers, and people who just want to support or buy a simple plan.

## Current Problem

The account-first billing path is useful for saved projects, dashboards, CRM, support history, and future upgrades. But it is too much friction for simple payment intent.

For small offers, people should not have to understand or complete:

- portal account creation
- sign-in
- billing preselection
- Stripe customer portal behavior
- app identity
- project setup

before they can pay.

## Recommended Billing Split

Use two billing paths.

### 1. Simple Stripe Pay Link

No portal account required.

Best for:

- $5 Friends & Family support
- $20 website or project support
- $50 builder support
- $200 managed support
- one-time deposits or custom payments later

The button goes straight to Stripe Checkout or a Stripe Payment Link. Stripe collects the buyer email, handles payment, and sends the receipt.

This path should be the primary payment action for simple plan cards.

### 2. Portal Account Billing

Keep the current account-based billing flow for people who need portal identity.

Best for:

- saved project dashboards
- CRM access
- private tools
- support history
- plan management inside the portal
- upgrades tied to a portal account

This path becomes a secondary link:

> Use portal account instead

## UX Pattern

Plan cards should prefer direct Stripe payment.

Example:

```text
$20/month
Website + Project Desk

[Pay with Stripe]
[Use portal account]
```

Friends & Family can be even simpler:

```text
$5/month
Support 3DVR

[Pay with Stripe]
```

## Implementation Plan

1. Create Stripe Payment Links for the simple plans:
   - $5/month
   - $20/month
   - $50/month
   - $200/month
   - one-time custom/deposit later

2. Store the links in configuration or environment variables:
   - `STRIPE_LINK_STARTER`
   - `STRIPE_LINK_PRO`
   - `STRIPE_LINK_BUILDER`
   - `STRIPE_LINK_ENTERPRISE`
   - `STRIPE_LINK_CUSTOM_DEPOSIT`

3. Update public and portal pricing buttons:
   - primary action: `Pay with Stripe`
   - secondary action where useful: `Use portal account`

4. Keep current Stripe customer portal behavior:
   - existing customers can still manage billing
   - account billing remains available for portal-managed subscriptions

5. Add optional post-payment onboarding:
   - Stripe success URL can point to `/start/?paid=pro`
   - page can say: `Payment received. Want to save your project? Create a portal account.`
   - account creation stays optional until the user needs saved tools

## Recommended First Surface

Start with the highest-friction public plan cards and support pages:

- 3dvr.tech pricing cards
- portal Friends & Family page
- portal Start page paid lanes
- portal billing plan cards, where appropriate

Do not remove the account path. Add a direct Stripe path beside it, then watch which path people use.

## Open Questions

- Should Stripe Payment Links map to existing products/prices or new simple products?
- Should each Stripe link use a success URL back to portal start?
- Should webhook handling create a lightweight lead record from Stripe email?
- Should paid users receive an email asking if they want portal setup?
- How should direct Stripe purchases be matched to future portal accounts?

## Principle

Do not make people create an account before they pay.

For small subscriptions and support payments, a normal buyer expects:

> click plan, pay in Stripe, get receipt.

The portal account should become useful after payment, not mandatory before payment.

