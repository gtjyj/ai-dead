# Electron Refactor Implementation Plan

## Background

The current codebase keeps most renderer logic in `src/App.jsx` and most main-process logic in `electron/main.js`.
This works for an MVP, but it now mixes UI composition, state orchestration, IPC calls, monitoring workflows,
Gist sync, persistence, and network compatibility logic in two oversized files.

## Goals

- Reduce the size and responsibility of `src/App.jsx` and `electron/main.js`.
- Separate renderer UI, renderer state/actions, main-process services, and IPC registration.
- Preserve current product behavior while improving maintainability.
- Keep Electron security defaults intact: `contextIsolation`, `preload` bridge, and no direct Node access in the renderer.

## Non-Goals

- No visual redesign.
- No feature changes to monitoring, Gist sync, or persistence behavior.
- No storage migration in this refactor.
- No credential storage redesign in this pass.

## Target Architecture

### Renderer

- `src/App.jsx`
  - Keep as the page-level composition entry only.
- `src/app/useMonitorApp.js`
  - Own bootstrap, derived state, UI actions, and IPC interaction.
- `src/components/*`
  - Split large JSX blocks into focused UI components.
- `src/lib/*`
  - Move formatting and metrics helpers into pure utility modules.

Planned renderer modules:

- `src/components/TopToast.jsx`
- `src/components/MonitorHero.jsx`
- `src/components/ApiConfigPanel.jsx`
- `src/components/RelayPanel.jsx`
- `src/components/RelayCard.jsx`
- `src/components/TestHistoryDots.jsx`
- `src/components/EventPanel.jsx`
- `src/components/ConfirmDeleteModal.jsx`
- `src/lib/monitorFormatters.js`
- `src/lib/monitorMetrics.js`

### Main Process

- `electron/main.js`
  - Keep as the Electron entrypoint only.
- `electron/main/window.js`
  - Own `BrowserWindow` creation.
- `electron/main/ipc.js`
  - Register all IPC handlers in one place.
- `electron/main/store.js`
  - Hold runtime and persisted in-memory state plus renderer state emission.
- `electron/main/data.js`
  - Own persistence, API payload validation, normalization, and CRUD helpers.
- `electron/main/relayCheck.js`
  - Own relay checks, scheduling, provider compatibility handling, and error parsing.
- `electron/main/gist.js`
  - Own Gist sync and restore flows.
- `electron/main/lib/*`
  - Shared main-process text and response helpers.

Planned main-process modules:

- `electron/main/constants.js`
- `electron/main/lib/text.js`
- `electron/main/lib/providerFetch.js`
- `electron/main/lib/errors.js`
- `electron/main/store.js`
- `electron/main/data.js`
- `electron/main/relayCheck.js`
- `electron/main/gist.js`
- `electron/main/ipc.js`
- `electron/main/window.js`

## Implementation Phases

### Phase 1: Extract Pure Renderer Utilities

- Move date, latency, clipboard, and model-label helpers out of `src/App.jsx`.
- Move availability, health, dot status, and latency aggregation helpers into a metrics module.
- Keep behavior identical.

### Phase 2: Split Renderer UI

- Extract `TestHistoryDots` first because it is already self-contained.
- Extract repeated relay card markup into `RelayCard`.
- Extract form, hero, event list, and delete modal into standalone components.
- Reduce `src/App.jsx` to orchestration and layout composition only.

### Phase 3: Move Renderer State and Actions into a Hook

- Create `useMonitorApp` to own:
  - bootstrap and state subscriptions
  - toast lifecycle
  - interval ticker for relative time
  - model filter state
  - all UI actions that call `window.monitorApi`
- Return state slices and action handlers needed by components.

### Phase 4: Split Main Process Modules

- Move constants into a dedicated module.
- Move store/state emission into `store.js`.
- Move persistence, normalization, and CRUD into `data.js`.
- Move provider fetch normalization, error parsing, and check scheduling into `relayCheck.js`.
- Move Gist operations into `gist.js`.
- Move window creation and IPC registration into dedicated modules.
- Shrink `electron/main.js` to startup wiring only.

### Phase 5: Verification

- Run a production build with `npm run build`.
- Fix any import or CommonJS/ESM issues caused by the split.
- Confirm that renderer and main-process entrypoints still match the existing `package.json` setup.

## Risks and Mitigations

- Renderer prop explosion
  - Mitigation: keep business actions inside `useMonitorApp` and pass grouped props where it improves clarity.
- Main-process circular dependencies
  - Mitigation: keep `store.js` as the lowest-level shared state module and avoid service-to-service cycles.
- Regression in monitoring state updates
  - Mitigation: preserve `buildPublicState()` and `emitState()` semantics while moving code.
- Regression in Gist sync or relay compatibility logic
  - Mitigation: move code with minimal behavioral edits before any cleanup.

## Success Criteria

- `src/App.jsx` becomes a small composition file.
- `electron/main.js` becomes a small startup file.
- Repeated relay-card UI exists in one place.
- Main-process concerns are separated into modules with clear responsibility boundaries.
- The app still builds successfully.

## Follow-Up Work After This Refactor

- Move shared constants and schemas to a cross-process shared module.
- Use `zod` for IPC payload validation.
- Migrate credential storage from JSON file to secure OS-backed storage.
- Add automated tests for pure helpers and service-level logic.
