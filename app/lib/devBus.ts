// Tiny dev-only event bus to re-trigger the onboarding flow from anywhere
// (e.g. a Profile button) without making a new account or touching the DB.
// Subscribed by App.tsx; fired by the dev "Replay Onboarding" button.
type Fn = () => void;

let replayCb: Fn | null = null;
let paywallCb: Fn | null = null;

export function onReplayOnboarding(cb: Fn): () => void {
  replayCb = cb;
  return () => { if (replayCb === cb) replayCb = null; };
}

export function triggerReplayOnboarding(): void {
  replayCb?.();
}

export function onPreviewPaywall(cb: Fn): () => void {
  paywallCb = cb;
  return () => { if (paywallCb === cb) paywallCb = null; };
}

export function triggerPreviewPaywall(): void {
  paywallCb?.();
}

// Set by SignupScreen just before signUp() so App.tsx can route a brand-new account
// STRAIGHT to onboarding (no users-row query, no loader frame between signup and intro).
let justSignedUp = false;
export function markJustSignedUp(): void { justSignedUp = true; }
export function clearJustSignedUp(): void { justSignedUp = false; }
export function consumeJustSignedUp(): boolean { const v = justSignedUp; justSignedUp = false; return v; }
