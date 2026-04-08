# Relay Pulse MVP Plan

## Goal

Build a lightweight Electron desktop client with a React renderer to quickly verify whether multiple AI relay endpoints are still usable.

## Core User Flows

1. Add an API relay configuration with name, base URL, API key, and model.
2. Delete an API relay configuration.
3. Start periodic connectivity checks with a configurable interval.
4. Stop periodic connectivity checks.
5. Review the latest status, latency, and error/result summary for each relay.

## Technical Approach

### Stack

- Electron for desktop shell and privileged Node runtime.
- React + Vite for the renderer UI.
- `@ai-sdk/openai-compatible` with `ai` for OpenAI-compatible connectivity tests.

### Architecture

- `electron/main.js`
  - Owns persistence, runtime timers, and connectivity testing.
  - Exposes IPC handlers for CRUD operations and test controls.
  - Runs `generateText` checks against each configured relay.
- `electron/preload.js`
  - Exposes a minimal bridge into the renderer via `contextBridge`.
- `src/App.jsx`
  - Presents API management form, monitoring controls, status cards, and event feed.
  - Receives live snapshots from the Electron main process.

### Data Model

Each relay item stores:

- `id`
- `name`
- `baseURL`
- `apiKey`
- `model`
- `status`
- `lastCheckedAt`
- `lastLatencyMs`
- `lastMessage`
- `lastError`
- `createdAt`
- `updatedAt`

App-level runtime state stores:

- monitoring on/off
- interval seconds
- last run time
- recent event log

## Testing Strategy

- Use `createOpenAICompatible({ baseURL, apiKey })` to create a provider per relay.
- Use `generateText` with a tiny prompt such as `Reply with OK only.` to verify the endpoint and model.
- Mark a relay as success/error based on the request outcome.
- Capture latency and a short response/error summary.

## Persistence

- Persist configured relays and saved interval to Electron `userData` as local JSON.
- Keep runtime monitoring state ephemeral.
- Store API keys locally for usability in this MVP.

## Delivery Steps

1. Scaffold Vite React renderer and Electron entry files.
2. Build IPC bridge and local persistence.
3. Implement add/delete relay actions.
4. Implement periodic runner with start/stop controls.
5. Build responsive status dashboard.
6. Install dependencies and verify the app builds.

## Future Enhancements

- Edit existing relay configs.
- Encrypt API keys with Electron safe storage.
- Add per-relay enable/disable switches.
- Add concurrent limit and retry policy.
- Export/import relay configuration files.
