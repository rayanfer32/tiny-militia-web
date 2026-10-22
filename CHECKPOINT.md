# Multiplayer Implementation Checkpoint

## Current state
- Phases 0–4 largely implemented; build passes (`npm run build`, `wrangler` typecheck).
- Single-player untouched; multiplayer end-to-end movement works in local test.
- Phase 5 polish in progress: client now defers firing to server authority, renders shot/hit/respawn events, invuln flicker on remote players, guards local damage in MP, updates match timer display in MP, and calls bullet/grenade visual updates in MP.

## What's done
- `shared/` extracted (physics, weapons, mapData, types); client re-exports.
- `worker/` Cloudflare Worker + RoomDO with authoritative tick (movement, hitscan, health, death, respawn, match timer), WebSocket hibernation.
- Client: mode selector, lobby UI, NetworkClient, MP Game mode with prediction/reconciliation, remote player rendering, kill feed, match end.
- Answers to open questions: fixed start weapon + pickups later; 2s respawn invuln; return to lobby; no spectator.

## How to run
- Client: `npm run dev` (Vite, port 5173)
- Worker: `cd worker && npx wrangler dev` (port 8787)
- Set `VITE_MP_API_BASE` if worker not on localhost:8787.

## Known gaps / next steps
- Combat polish: rockets/grenades sync, weapon pickups, invuln flicker on client (partial).
- Lag compensation (position history) not implemented.
- Delta snapshots / compression not implemented.
- Mobile/touch in MP not fully tested.
- Host migration: match ends on host disconnect (MVP).
- Reconnect within 30s not implemented.
- Remove `worker/data/outpost.json` duplication (keep in sync with public).
- Tests: manual two-browser matrix; free-tier budget check.

## Last modified files
- src/game.ts (MP authority/event/timer/visual guards), CHECKPOINT.md.

## Resume
- Continue with Phase 5 polish & hardening.
- Run `npm run build` after changes.
