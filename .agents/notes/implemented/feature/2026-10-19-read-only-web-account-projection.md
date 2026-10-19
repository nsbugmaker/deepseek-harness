# Agent Note: Read-only account projection in a plain browser

Status: implemented

English | [中文](2026-10-19-read-only-web-account-projection.zh.md)

## Problem

The account sidebar menu and Account settings section registered only when the Desktop preload bridge existed. A browser served by the same Host could therefore not show an account the Host already held, and the menu's wallet summary was Desktop-only by accident of that gate rather than by a product decision about wallets.

## Decision

The account client activates in both renderers. The bridge now selects only the actions that need Desktop: sign-in, sign-out, the model sign-in choice, the account quota notice, the native Platform page, and Desktop onboarding. The injected face carries `readOnly` when the bridge is absent.

A read-only launcher registers while the Host reports `credential-stored` or the model API key reports a wallet, and it drops the Sign in and Sign out rows together with both session dialogs. The signed-in projection keeps the profile, the wallet rows, the bonus notice card, and the Account settings section. Usage and top-up links open new tabs because no native Platform page exists there.

When no grant is stored, the Host's `getBalance` reads the model API key's `GET /user/balance` on the inference origin and projects `topped_up_balance` as the recharge wallet and `granted_balance` as the bonus wallet. The request refuses redirects, a missing key yields no balance, and a rejected or malformed read yields a failed outcome.

Sign-in remains implemented behind the hidden action and reports `login_source: web`; the read-only surface never invokes it.

## Alternatives considered

**Keep the Desktop-only gate.** The wallet summary would stay invisible in a browser even when the Host holds a valid grant, which is the reported gap; rejected.

**Offer full account actions in a browser.** Browser sign-in needs a product decision, and a remote deployment cannot receive the loopback callback that the provider accepts; rejected for now, recorded here as the condition for a later change.

**Gate the projection behind a plugin configuration flag.** No deployment needs the old isolation, and the read-only surface only reads Host state, so a second behavior switch would add configuration without a consumer.

**Add a separate Remote method for the API-key wallet.** Reusing `getBalance`'s no-grant outcome keeps one wallet surface and avoids a new Typert method for a read only this UI consumes; rejected.

## Consequences

The browser sidebar replaces the Settings trigger with the account launcher whenever the Host stores a credential or the model API key reports a wallet, and every such browser tab subscribes to `account/watch` plus the profile, balance, and unnotified-bonus reads. The API-key source carries no profile, bonus notice, or Platform links, so those surfaces still require the account grant. The account quota notice and the model sign-in step remain Desktop-only, so a browser quota failure keeps the generic Chat notice.

If browser sign-in is ever exposed, it must use `login_source: web` and a loopback origin; non-loopback deployments cannot complete the callback. `apply.client.spec.ts` pins the signed-out boundary and the read-only projection, and `account.client.spec.tsx` pins a menu without session actions.
