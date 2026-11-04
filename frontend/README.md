# Engineering AI frontend

Angular 21 standalone application with Angular Material. See the [root README](../README.md) for full-stack setup.

```bash
npm ci
npm start       # http://localhost:4200 ; /api proxies to port 8000
npm test        # headless Vitest unit tests
npm run build   # dist/frontend/browser
```

The lockfile supports npm 10 clean installs. If updating dependencies triggers an npm 10 resolver error, use `npx npm@11 install` to refresh it, then verify `npm ci`.
