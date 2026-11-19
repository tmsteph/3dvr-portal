// After Dark access for the character sites: the paywall, in one place.
//
// The model is the same curtain the world page already uses: the image
// files live in the open repo, so this is a curtain, not a vault. What v2
// adds is the shape of a real paywall around it.
//
// resolveAfterDarkAccess(state) is the single entitlement check. It takes
// the two facts that can open the curtain today and returns one of:
//
//   'owner'   — signed in to the portal on this device (the owner). Open.
//   'member'  — an After Dark entitlement is on file for this visitor.
//               Open. Today that flag is only ever set by hand; the
//               Stripe webhook flow is what will set it for real (see
//               below).
//   'locked'  — everyone else. The section renders its frames blurred
//               behind the unlock prompt.
//
// GOING LIVE IS A CONFIG CHANGE, NOT A CODE CHANGE:
//   1. Create the Stripe product + Payment Link in the Stripe dashboard
//      (Thomas's pricing call; nothing here creates products or charges).
//   2. Paste the link into AFTER_DARK_PAYWALL.paymentLink below.
//   Until then the unlock prompt shows without a working button.
//
// THE FUTURE WEBHOOK SEAM: the portal already has billing plumbing
// (src/billing/plans.js + src/billing/stripe.js resolve a portal identity
// to a Stripe customer and its active subscriptions, and
// api/webhooks/stripe.js receives the events). When a checkout completes,
// that flow records the entitlement for the buyer's portal identity; the
// character page then asks the server for its entitlement state and passes
// it into resolveAfterDarkAccess as `entitled`. This function stays the
// one place that decides — flip what feeds `entitled`, not the checks
// scattered around the page.

export const AFTER_DARK_PAYWALL = {
  // Stripe Payment Link URL for the After Dark unlock. Empty = not live.
  paymentLink: '',
  // Shown on the unlock prompt when the link goes live.
  priceLabel: '',
  unlockLabel: 'Unlock After Dark'
};

const ENTITLEMENT_KEY = '3dvr.girl.afterDarkEntitlement';

export function readAfterDarkEntitlement(storage = globalThis.localStorage) {
  try { return storage?.getItem(ENTITLEMENT_KEY) === 'active'; } catch { return false; }
}

export function resolveAfterDarkAccess({ signedIn = false, entitled = false } = {}) {
  if (signedIn) return 'owner';
  if (entitled) return 'member';
  return 'locked';
}
