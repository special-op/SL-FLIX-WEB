# SL-FLIX codebase audit

Date: 2026-10-15. Scope: source/configuration inspection and local checks, not a penetration test or physical-device/Lighthouse audit. Findings below are risks supported by code paths, not claims of exploited vulnerabilities.

## Changes made in this pass

- Synchronized `package-lock.json` with the manifest: the lock root omitted `socket.io-client` and carried a different Node engine declaration.
- Added explicit Node types, `.nvmrc`, strict Docker lockfile installs, non-root runtime, and health checks. Docker uses Node 20.19.0; local shell is Node 22.23.3, so exact-runtime verification remains outstanding.
- Replaced browser-runtime Tailwind with build-time CSS (`tailwind.config.cjs`, `postcss.config.cjs`, `styles.css`). Retained Font Awesome because the source still uses it extensively.
- Removed the duplicate Socket.IO CDN script and switched the application to its installed client.
- Restored mobile zoom and text selection. Scoped `select-none` classes still remain on individual controls.
- Rendered external subtitle cues as React text rather than raw HTML. Subtitle formatting tags now appear as text; a safe formatting parser is a follow-up.
- Added offline source regression checks and `make test` (regressions, TypeScript, build).
- Preserved all existing proxy routes as requested, while hardening non-proxy surfaces. Removed the unused public `/api/event` broadcaster and `/api/visitors` telemetry endpoint instead of leaving unauthenticated broadcast/analytics APIs exposed.
- Added Socket.IO payload/rate limits, server-issued socket identity, room-membership checks, host-only room controls, validated room/chat payloads, security headers, accessible movie cards/controls, reduced-motion/hidden-tab animation pausing, bounded retry logic with offline stop and jitter, and mobile `dvh`/safe-area handling.
- Added a Vite alias/types compatibility layer for the installed Motion packages so the production build can use their shipped CommonJS entrypoints when an npm mirror omits ESM files.
- Added host-approved watch-room invites: shareable request links, short room codes, pending-request notifications, and approve/deny controls. Pending requests are never included in the public active-room listing.

## Release blockers / security

| Priority | Evidence | Weakness | Recommended change |
| --- | --- | --- | --- |
| P0 | `server/api.js` URL-driven anime/adult/image proxy routes; `server.js` redirect recursion | Outbound requests accept arbitrary destinations; private addresses and redirects are not consistently constrained | Domain allowlist, resolved-address checks, redirect revalidation and hop limits, request timeouts, size limits and endpoint rate limits. Validate every proxy, including image/OG requests. |
| P1 | `server.js` watch-party socket handlers | A room join still starts with a user-provided display name; room identity is socket-bound after joining, but creator re-authentication across a new socket is not yet token-based | Add a short-lived host capability token for reconnects; keep current server-issued socket identity and membership checks. |
| P1 | `server.js` `injectSeoTags`, `getBaseUrl`; `services/seo.ts` | HTML string interpolation and host-derived URLs lack consistent escaping/trusted-origin rules | Context-aware escaping, HTTP(S) URL validation and configured public origin. Test malicious metadata and forwarded hosts. |
| P1 | `server.js` headers; `public/_headers` | Hosting-file headers do not reliably protect Express; CSP is broad | Central Express headers, tailored CSP compatible with media providers, referrer/permissions/frame policies. Only enable HSTS behind guaranteed HTTPS. |

Do not expose the service publicly with a new Telegram promotion until the P0 controls are implemented. Review content licensing, third-party provider terms, adult-content age safeguards and privacy obligations before wider distribution.

## Faster loading and lower mobile battery/data use

1. **Initial assets:** compiled Tailwind removes runtime stylesheet generation; bundled Socket.IO removes a separate CDN dependency. No speed percentage is claimed because no Lighthouse/device baseline was captured.
2. **Route loading:** `App.tsx` already lazy-loads some features/player code. Profile actual initial imports and defer remaining heavy sections, Three.js and shader code until requested. Chunk separation alone does not prove lazy loading.
3. **Live TV:** `components/LiveTv.tsx` starts multiple catalog/guide/match requests. Fetch active-tab data first, defer fallbacks, paginate catalogs and virtualize very large lists.
4. **Retries:** `hooks/useInfiniteRetryFetch.tsx` now caps retries at five by default, stops while offline, adds jitter, and exposes the final error. A manual retry action remains the recovery path.
5. **GPU:** `components/AnimeThreeCanvas.tsx` now respects reduced motion and pauses while the page is hidden. Intersection-based offscreen pausing and a static low-power fallback remain follow-ups.
6. **Caches:** `services/cache.ts`, `server/api.js`, and Maps in `server.js` need maximum sizes, eviction and normalized key limits. Shared storage is needed for multi-instance room state.
7. **Images/fonts:** preserve lazy posters, give images dimensions/aspect ratios, use properly sized WebP/AVIF, prioritize only the visible hero image, and consider self-hosted subset fonts/icons.
8. **PWA:** inspect overlapping manual `/sw.js` registration and Vite PWA registration. In `vite.config.ts`, the broad TV/API cache rule precedes the image rule and may intercept it. Audit cache freshness and never cache private or streaming responses indiscriminately.

## PC, mobile and accessibility roadmap

- `components/MovieCard.tsx`: now uses a semantic keyboard-focusable button with an accessible name.
- High-impact player/navigation icon buttons now have labels; the rest of the icon inventory still needs a full device/screen-reader pass.
- Shared dialogs: focus trap/restoration, Escape, `aria-modal`, background inert/scroll lock.
- Mobile fixed dock/player overlays: safe-area padding, virtual-keyboard handling, `100dvh` and collision-free z-index rules. Test portrait and landscape at 320/360/390px widths.
- PC: keyboard-first navigation, useful player shortcuts that do not intercept typing, accessible tooltips, and predictable browser Back/Forward behavior.
- Tablet/large screens: comfortable card widths, density settings, visible labels rather than hover-only controls.
- Add user-selectable low-data/reduced-effects mode, clear buffering/errors, resume playback, favorites, continue-watching and subtitle preferences. Verify current capabilities before duplicating them.
- Device matrix: Android Chrome, iOS Safari, Windows Chrome/Edge/Firefox, 200–400% zoom, reduced motion, screen reader and slow-network tests.

## Telegram integration plan (not implemented)

Provide the actual channel URL before implementation; do not invent a handle. Use a validated `https://t.me/<channel>` configuration and a small accessible Join Telegram link in the footer/community area. Avoid mandatory popups or heavy widgets. External tabs should use `rel="noopener noreferrer"`.

Later additions: share a content URL to Telegram, optional announcement card with dismiss persistence, and user-requested notifications. Automated publishing requires a server-side bot, protected admin action, rate limits and environment-only token storage; never expose a bot token through a `VITE_*` variable.

## Maintainability and operations

`App.tsx`, `server.js`, `server/api.js`, `services/api.ts` and `WatchPartyView.tsx` combine many responsibilities. Split by feature/domain after security fixes, standardize motion/icon usage, validate upstream response schemas and add parser/cache/socket/API tests. Stop converting every failure into an empty success state. Add structured redacted logs, request IDs, graceful shutdown and real readiness criteria. `/readyz` currently only reports that the process can answer; it does not check dependencies.

## Actual verification

- `node --test audit.test.mjs`: **3 passed** (manifest/lock root parity, mobile/CDN regressions, no raw subtitle HTML).
- `npm ci --dry-run --ignore-scripts --no-audit --no-fund`: **passed lockfile validation**, with Node engine warning. This is not a successful clean install.
- Full `npm ci` attempts: timed out; offline attempt failed on an uncached package. Subsequent installs reported success but local dependency files remained missing/truncated (for example motion package entry/type files). This environment is not a verified clean dependency tree.
- `npm run lint`: **passed** after adding explicit event types and a Motion compatibility declaration.
- `npm run build`: **passed**; Vite generated the production bundle and PWA service worker. The build reported a 522 KiB largest JS chunk, so route-level performance work remains.
- `node --check server.js`, `tailwind.config.cjs`, `postcss.config.cjs`: **passed**.
- Docker build, endpoint integration checks, device/browser rendering and Lighthouse: **not run**. A local server smoke attempt reached startup but curl verification was inconclusive because the process was performing long external IPTV initialization.

Next verification: install from the synchronized lockfile in a fresh Linux container with the pinned Node runtime, then run `make test` and a browser/device matrix. Proxy behavior remains intentionally unchanged and still requires a separate provider-compatible security review.
