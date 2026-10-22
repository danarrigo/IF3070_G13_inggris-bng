# Ship optimizer frontend

React, TypeScript, Vite, and Three.js. See the [repository README](../../README.md) for MongoDB/backend setup and algorithm behavior.

```bash
npm ci
npm run dev
```

- `/#config`: edit, generate, save, and load scenarios.
- `/#optimization`: run Steepest Ascent with live WebSocket progress, candidate previews, animated state changes, and an objective chart.
- Vite forwards HTTP and WebSocket `/api` traffic to FastAPI on port 8000. Production hosting must support WebSocket upgrades too.
- Drafts and results survive page navigation, but not a full browser refresh.

## Checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run format` to apply Prettier formatting. Node-based tests cover protocol/state handling, bounded animation playback, scene layout, rotation, and GPU-resource disposal; browser testing is needed for actual WebGL and WebSocket behavior.
