# Contributing to CHScanner

Thank you for your interest in contributing. This document outlines how to set up the project, run the app, and follow basic quality checks.

## Development setup

1. Clone the repository and install dependencies:

   ```bash
   npm install
   cd ui && npm install && cd ..
   ```

2. Copy `.env.example` to `.env` and add at least `SERPER_API_KEY` (and any other keys you need for the features you’re testing).

3. Start the backend and Vite dev server:

   ```bash
   npm run dev
   ```

   - Backend: http://localhost:3001 (API + Socket.IO)
   - Frontend: http://localhost:5173 (open this in the browser; Vite proxies `/api` and `/socket.io` to the backend)

## Code structure

- **Backend:** `src/` — `server.js` (entry), `config.js`, `index.js` (pipeline), `routes/` (API handlers), `services/` (business logic).
- **Frontend:** `ui/src/` — `App.jsx` (routing, layout), `pages/`, `components/`, `api/` (client), `hooks/`, `constants/`.
- **Scripts:** `scripts/` — build and sync helpers; see [SCRIPTS.md](SCRIPTS.md).
- **Docs:** `docs/` — architecture, API, deployment, scripts. Root: README, ROADMAP, TROUBLESHOOTING.

## Linting

- **Root (backend + scripts):** `npm run lint` (ESLint on `src/` and `scripts/`).
- **UI:** `cd ui && npm run lint`.
- **Both:** `npm run lint:all` (if configured).

Fix reported issues before submitting changes.

## Tests

The project does not yet include an automated test suite. Adding unit or integration tests (e.g. for services or API routes) is encouraged; when present, run them before submitting and mention how to run them in this file or in README.

## Feature backlog

See [ROADMAP.md](../ROADMAP.md) for the current feature backlog and priorities. If you pick up an item, consider opening an issue or commenting so work is not duplicated.

## Submitting changes

1. Make your changes on a branch.
2. Run `npm run lint` (and `cd ui && npm run lint`) and fix any issues.
3. Ensure the app still runs with `npm run dev` and that key flows (e.g. Find leads, Kanban, Profile) work as expected.
4. Open a pull request with a short description of the change and reference any related issue or roadmap item.

If the project adopts a formal code review or CI process, that will be documented here.
