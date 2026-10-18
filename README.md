# SL FLIX PRO

SL FLIX PRO is a modern, high-performance streaming and media application engineered with React, TypeScript, Express, and Tailwind CSS. Built for modern web and mobile devices, it delivers a smooth cinema experience with Live TV channels, real-time sports updates, webtoon reader, and on-demand streaming.

## Features

- **Live TV & IPTV Network**: Over 500+ HD streaming stations with smart stream resolution, logo proxier, and continuous background playlist synchronization.
- **Movie & Series Catalog**: High-definition movie details, dub selection, episode guide, and interactive player overlay.
- **Live Sports Hub**: Real-time scores, match schedules, live action feeds, and sports highlights.
- **Webtoon & Reader**: Interactive digital webtoon collection with continuous page viewer and reading history.
- **HLS Streaming Player**: Custom HTML5/HLS video player with adaptive bitrate control, quality switching, and volume controls.
- **Floating Navigation Dock**: Responsive desktop and mobile navigation dock with smooth spring animations.
- **Host-approved Watch Rooms**: Hosts can share a link or short room code; guests request entry and hosts approve or deny them before synchronized playback begins.
- **Adaptive low-data mode**: Detects slow/offline conditions, reduces poster/trailer work, and lets users override the mode.
- **Watch Party reconnect and wait timer**: Host-token reconnect, manual approval, a ten-minute empty-room grace period, and a waiting-room Guess the Poster game.

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Motion (Framer Motion), Lucide React
- **Video Engine**: Hls.js, HTML5 Media Source Extensions
- **Backend Server**: Node.js, Express, Custom Caching Engine
- **Build System**: Vite, Esbuild, PostCSS

## Getting Started

### Prerequisites
- Node.js 20.19 or newer (the tested runtime is pinned in `.nvmrc`)
- npm 10+

### Installation

1. Install dependencies from the lockfile:
    ```bash
    npm ci
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

4. Run production server:
   ```bash
    NODE_ENV=production npm run start
    ```

### Checks

Run the same offline-friendly project check used by CI after dependencies are installed:

```bash
make test
```

This runs offline source regression tests, TypeScript validation, then the production Vite build. These checks require an installed dependency tree but do not need live media providers. `npm ci` is intentionally strict: if `package.json` and `package-lock.json` diverge, installation fails instead of silently falling back to a different dependency tree.

See `AUDIT.md` for known release blockers and actual verification results. The current `make test` check includes the production build.

### Watch-room invites

1. Open **Watch Party** and create a room.
2. Use **Invite** to share the request link, or copy the six-character code.
3. A guest opens the link or enters the room from the active-room list and selects **Request to Join**.
4. The host receives a request in the room controls and chooses approve or deny.
5. Approved guests are admitted and receive the current synchronized room state. A denied guest stays outside the room and can try another room.

### Environment

Copy `.env.example` to `.env` and set deployment-specific values. Never commit `.env` or API credentials.

| Variable | Purpose | Default/example |
| --- | --- | --- |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Runtime mode | `production` |
| `PUBLIC_ORIGIN` | Public deployment origin used by integrations | `http://localhost:3000` |
| `DISABLE_HMR` | Disable Vite HMR in development | `false` |
| `VITE_APP_TITLE` | Frontend title override | `SL-FLIX-PRO` |
| `VITE_ENABLE_MOCK_DATA` | Frontend mock-data switch | `true` |
| `VITE_ENABLE_ADULT_SECTION` | Expose the optional +18 navigation item | `false` |

The server listens on `PORT` and exposes `/healthz` for container/load-balancer health checks. The optional adult section is off unless explicitly enabled at build time.

### Docker

```bash
docker build -t sl-flix-pro .
docker run --rm -p 3000:3000 --env-file .env sl-flix-pro
```

The image uses the lockfile, builds the frontend in a separate stage, runs as a non-root user, and includes a health check.

### Deploy notes

- Use Node 20.19 or newer; `.nvmrc` and the Dockerfile pin the tested Node 20.19.0 image.
- Run `npm ci`, `make test`, then deploy the Docker image or the built application with `NODE_ENV=production`.
- Provide `.env` through the deployment platform's secret/environment settings; do not bake it into an image or commit it.
- Configure the platform health check to call `/healthz`. External movie providers can be unavailable; the player fails fast and offers Retry instead of spinning indefinitely.

## Known limitations

- Third-party catalog, movie-source, and live-stream providers can return 5xx errors or time out. The app displays a retryable unavailable state when that happens.
- The proxy lockdown work is intentionally kept on branch `wip/proxy-and-hud`; the four related regression tests remain skipped on this branch.
- `make test` requires GNU Make on the machine. If Make is unavailable, run the equivalent `npm run test` command.
- A real device/browser Lighthouse run is not part of the offline test suite.

## Project Structure

```
├── components/          # React components (LiveTv, Navbar, Footer, Dock, etc.)
├── server/              # Express backend server and IPTV storage engine
├── data/                # Local data storage and cached station lists
├── services/            # Client data services
├── types.ts             # Global TypeScript type definitions
└── server.js            # Main server entry point
```

## License

MIT License. Built for seamless media streaming.
