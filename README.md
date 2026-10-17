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

Copy `.env.example` to `.env` and set deployment-specific values. Never commit `.env` or API credentials. `PUBLIC_ORIGIN` documents the public URL for deployment integrations; the server listens on `PORT` (default `3000`) and exposes `/healthz` for container/load-balancer health checks.

### Docker

```bash
docker build -t sl-flix-pro .
docker run --rm -p 3000:3000 --env-file .env sl-flix-pro
```

The image uses the lockfile, builds the frontend in a separate stage, runs as a non-root user, and includes a health check.

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
