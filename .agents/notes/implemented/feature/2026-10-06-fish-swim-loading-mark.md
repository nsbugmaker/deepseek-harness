# Agent Note: The fish mark swims as the hero and history loading treatment

Status: implemented

English | [中文](2026-10-06-fish-swim-loading-mark.zh.md)

## Problem

The conversation hero's fish mark moved only under the pointer, so the one animated asset the product owns stayed still on the surfaces that most need a sign of life: the blank-draft hero, the `settling` phase (a session is replaying its history and the shell cannot yet know whether the hero or the docked composer is correct, so the column is empty), and the chat view's history-replay caption. Those surfaces showed bare text or nothing at all. The swim geometry — the two weighted deformations of the silhouette — lived inside `ui-conversation`'s hero module, where no second package could reach it: a feature plugin must not runtime-import another feature plugin's values.

## Decision

`FishLogo` in [ui-primitives](../../../../packages/client/ui-primitives/README.md) takes a `swim` prop. SMIL interpolates the path's `d` through the tail-up and tail-down frames while a [CSS module](../../../../packages/client/ui-primitives/src/FishLogo.module.css) sways the whole mark on the same 1.6s period, so the tail wags in real curve deformation rather than a rigid rotation. The two morph targets live in [fish-swim.ts](../../../../packages/client/ui-primitives/src/fish-swim.ts) beside the resting path; the package's public export list is unchanged, and an unset `swim` renders exactly the previous svg, including the absent `class` attribute that the assembled DOM snapshots pin.

Five surfaces use it, each with one treatment:

- The hero mark (`EmptyHero.tsx`) swims unconditionally. The blank-draft hero is a landing surface, not a resting one, so the mark carries the page's own motion instead of a hover reward; the hitbox keeps its stationary layout box but loses its pointer handlers.
- The `settling` phase (`ConversationContent.tsx`) centers the same mark in the otherwise empty column, named for assistive technology by the localized `session.loading` string and showing no visible text. It yields to a mounted view area through CSS (`:has(.viewArea)`), so a session that already renders a view keeps that view's loading surface and one region never shows two treatments.
- The chat view's history-replay caption carries a 14px mark beside its existing text, in the caption's own tertiary ink.
- The application's startup screen (`apps/web/index.html`) paints the mark inline before any script runs, and the framework-free boot page adopts that screen: it fills the reserved `data-dsh-boot-status` host with the progress ring and hint instead of drawing its own card, so the mark is painted once and never repainted. The React mount replaces the whole mount point when the UI is ready.
- The Desktop splash window (`apps/desktop/renderer/splash.html`) shows the mark while the Host starts, before any application window exists. It leaves when the welcome window or the main window becomes visible, and a fatal startup report takes it down first, so it can never outlive the screen it stands in for.

Reduced motion keeps the static mark on both channels: the renderer omits the SMIL element when the platform states the preference, and the stylesheet drops the sway, so a preference that changes while the mark is mounted still reaches the animation.

## Alternatives considered

**Replace the shared `StateDot` ongoing spinner globally.** The ongoing dot also marks tool execution and step progress inside transcript rows, where a brand mark would outweigh the row it sits in; it is the wrong scale for a 10–14px gutter. The change was scoped to the hero and history loading.

**Add a `FishSwim` component beside `FishLogo`.** It would duplicate the svg scaffolding, the 23.16:17.04 ratio, and the `currentColor` ink semantics of the existing primitive, against the package's own reuse rule: extend an existing primitive before adding a parallel one.

**Keep the morph targets in `ui-conversation` and copy them into `ui-chat`.** The client export discipline forbids a feature plugin importing another feature plugin's values, and a hand-copied deformation would drift from the generated one. Shared runtime code belongs in a static owner, which is what ui-primitives is.

**Import that geometry into the two startup layers instead of giving each its own artwork.** The boot page must keep working before React arrives, and the Electron main process must not bundle a browser UI library, so neither can import the primitive. Both startup screens therefore carry the mark as static artwork generated from the same source at authoring time — the choice `renderer/assets/welcome-brand.svg` already records for native windows. The cost is that the two assets must be regenerated when the geometry changes; the benefit is that the product's first paint needs no bundle at all.

**Animate the outline with the CSS `d` property so a media query owns reduced motion with no JavaScript.** The CSS `d` property is not implemented across every engine this GUI serves, while SMIL is; the primitive keeps a single guarded probe instead.

**Keep hover as the hero's trigger and add the mark only to the loading surfaces.** Hover reaches pointer users on the one surface where nothing competes for attention, which is the opposite of the states that need the signal.

## Consequences

- The landing surface now runs an animation whenever a blank draft is on screen; a stated reduced motion is the only opt-out, and it is honoured on both the shape and the pose — including the two startup screens, whose SMIL is dropped by a small inline script because a media query cannot reach it.
- Startup no longer opens on an empty desktop or a blank document: the splash window covers the Host's start, and the served page paints the mark before its first script runs.
- History loading reads as the product's own mark rather than a bare caption, and the settling column no longer flashes empty chrome.
- The swim targets (about 5.6 KB of path data) and the sway keyframes moved from `ui-conversation` into `ui-primitives`; `EmptyHero.tsx` shrank by its local fish component's animation code and `ui-conversation` no longer owns any SVG curve data.
- The primitive's reduced-motion branches, the hero fallback, the settling mark, and the chat caption are pinned by `pnpm run test:gui`; the assembled DOM snapshots of the sidebar brand mark are unchanged.
- The mark is decorative in the hero (hidden from the accessibility tree) and a labelled `status` region in the settling column; the chat caption keeps its existing text as the accessible content.
