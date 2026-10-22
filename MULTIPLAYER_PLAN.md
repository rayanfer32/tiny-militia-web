# Multiplayer Feature Plan — Tiny Militia Web

> Companion to `AGENTS.md` / `CLAUDE.md`. This document plans the addition of
> **online PvP Deathmatch** (Free-for-All, up to 8 players) on top of the existing
> single-player wave-survival game, using a **Cloudflare Workers + Durable Objects**
> authoritative server over WebSockets. Single-player is retained.

---

## 0. Decisions (from scoping)

| Topic | Decision |
|---|---|
| Mode added | PvP Deathmatch, Free-for-All (FFA) |
| Players per match | up to 8 |
| Transport | Client–Server over WebSocket (authoritative server) |
| Backend | Cloudflare Workers + Durable Objects (SQLite-backed) |
| Join flow | Room codes (host creates, others enter code) |
| Match rules | Time limit only (default 5 min), instant respawn after 3 s |
| Identity | Anonymous nickname (no accounts) |
| Single-player | Kept (mode selector on start screen) |
| Deliverable now | Plan only; implementation starts after review |

---

## 1. Goals & Non-Goals

### Goals
- Add online FFA deathmatch for up to 8 concurrent players.
- Server-authoritative simulation (movement, combat, health, scoring) to prevent cheating.
- Reuse the existing map (`outpost`), physics, weapons, procedural models, HUD, audio.
- Keep single-player wave survival working unchanged.
- Run the backend on Cloudflare's free tier for low traffic; document the paid upgrade path.

### Non-Goals (this phase)
- Accounts / authentication / persistent leaderboards (anonymous nicknames only).
- Matchmaking / public lobby browser (room codes only).
- Voice chat.
- Anti-cheat beyond server authority + input validation.
- Bots in multiplayer (may be added later as fill).
- Team Deathmatch (architecture should not block it, but not implemented now).

---

## 2. Can the whole backend run on Cloudflare's free tier?

**Yes, with caveats.** Durable Objects are available on the Workers **Free** plan, but only
**SQLite-backed** DOs, and with these daily limits:

| Resource | Free daily limit | Notes |
|---|---|---|
| Requests | 100,000 / day | WebSocket connection setup counts; incoming WS messages bill at **20:1** ratio (100 msgs ≈ 5 requests) |
| Duration | 13,000 GB-s / day | Shared across active DOs; hibernating DOs incur none |
| CPU per invocation | 10 ms (Workers) | Applies to Worker entry; DO handlers also bounded |
| Storage (SQLite) | 5 GB total | Plenty for room state / no persistence needed |

**Implications for an 8-player real-time shooter:**
- A naïve 60 Hz full simulation with 8 players ≈ millions of messages/day → exceeds free tier.
- Mitigation (built into this plan): **WebSocket Hibernation API**, **10–15 Hz snapshot broadcast**,
  **20 Hz input sampling**, **delta compression**, short match durations (5 min), and DOs that
  hibernate when empty. Realistically this supports hobby/low-traffic usage on free tier.
- For sustained traffic, upgrade to Workers **Paid ($5/mo)**: 1M requests/mo + 400,000 GB-s/mo,
  which comfortably covers 8-player rooms. **Recommend planning for paid from day one in prod.**
- Cloudflare **Containers** (running a Node game server) is paid/beta — not used here.
- Frontend hosting: **Cloudflare Pages** (free) for the Vite build.

---

## 3. Architecture Overview

```
┌──────────────────────────┐         WebSocket (wss://)          ┌──────────────────────────────┐
│  Browser (Vite + Three.js)│  ───────────────────────────────►  │  Cloudflare Worker (edge)    │
│  - Single-player (local) │  inputs (move/aim/fire/...)        │  - HTTP: create/join room    │
│  - Multiplayer client    │  ◄───────────────────────────────  │  - Routes WS to RoomDO       │
│    prediction + interp   │  snapshots + events                │  - Static assets (Pages)     │
└──────────────────────────┘                                    └──────────────┬───────────────┘
                                                                                │
                                                                       ┌────────┴────────┐
                                                                       │  RoomDO (one per│
                                                                       │  match, SQLite)  │
                                                                       │  - players map  │
                                                                       │  - tick loop    │
                                                                       │  - physics sim  │
                                                                       │  - broadcast    │
                                                                       └─────────────────┘
```

- **One Durable Object instance per match room** (keyed by room code). Holds all live state.
- **Worker** is stateless glue: validates requests, creates/joins rooms, upgrades WebSockets,
  forwards to the correct DO stub.
- **Frontend** is the existing Vite app, extended with a networking layer and a mode selector.
- Single-player path is untouched (runs entirely in browser).

---

## 4. Repository / Project Structure

```
tiny-militia-web/
├── src/                          # existing client (Vite)
│   ├── game.ts                   # + mode branch (single vs multiplayer)
│   ├── net/                      # NEW: client networking
│   │   ├── NetworkClient.ts
│   │   ├── Prediction.ts
│   │   └── Interpolation.ts
│   ├── ui/                       # NEW: lobby UI helpers (or inline in game.ts)
│   └── shared/                   # NEW: isomorphic simulation (used by client + worker)
│       ├── physics.ts            # moved/extracted from physics.ts
│       ├── weapons.ts            # moved from weapons.ts (defs only)
│       ├── mapData.ts            # outpost.json loader + collision polys
│       └── types.ts              # shared net + state types
├── worker/                       # NEW: Cloudflare Worker + DO
│   ├── index.ts                  # Worker entry (HTTP + WS upgrade)
│   ├── RoomDO.ts                 # Durable Object: room simulation
│   ├── LobbyDO.ts                # optional: room registry (or use KV; keep simple: codes)
│   └── wrangler.toml
├── shared/                       # symlink/alias to src/shared (or duplicate via tsconfig paths)
├── public/                       # unchanged (map data, audio)
├── MULTIPLAYER_PLAN.md
└── ...
```

> Note: To avoid duplicating simulation code, place `shared/` at repo root and reference it from
> both `src/` (via Vite `resolve.alias`) and `worker/` (via Wrangler `tsconfig` paths / bundler).
> Both sides compile TypeScript; keep shared code free of DOM/Three.js/Node APIs.

---

## 5. Backend Design

### 5.1 Wrangler config (worker/wrangler.toml)

```toml
name = "tiny-militia-mp"
main = "index.ts"
compatibility_date = "2026-10-01"

[durable_objects]
bindings = [{ name = "ROOMS", class_name = "RoomDO" }]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RoomDO"]

[vars]
MAX_PLAYERS = "8"
MATCH_DURATION_SEC = "300"
```

### 5.2 HTTP API (Worker)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/rooms` | Create room → returns `{ code, hostToken }` |
| POST | `/api/rooms/:code/join` | Join by code → returns `{ playerToken, wsUrl }` |
| GET  | `/api/rooms/:code` | Room info (player count, state) |
| WS   | `/ws/:code?token=...` | Upgrade to WebSocket for the room |

Room codes: 6-char alphanumeric (e.g. `ABC123`), generated server-side, collision-checked.

### 5.3 RoomDO (authoritative simulation)

State:
```ts
interface RoomState {
  code: string;
  status: 'waiting' | 'running' | 'ended';
  players: Map<string, PlayerState>;   // playerId -> state
  projectiles: ProjectileState[];
  scoreLimit: null;                   // time limit only
  timeRemaining: number;              // seconds
  startedAt: number | null;
  hostId: string;
}
```

Responsibilities:
- Accept WebSocket connections (with hibernation).
- Maintain per-player input buffers (latest input per player).
- Run a **fixed-timestep tick** (default 20 Hz / 50 ms) via `setAlarm` + hibernation-aware wakeups.
  - While `status === 'running'` and ≥1 connected client, schedule next alarm.
  - On alarm: step simulation, broadcast snapshot, schedule next alarm.
  - When empty or ended: stop scheduling (DO hibernates).
- Apply inputs → physics (shared module) → combat → scoring → respawn timers.
- Broadcast state snapshots to all connected clients.
- Handle disconnects: mark player dead/disconnected, remove after timeout.

**Tick loop safety on free tier:** Use hibernation so idle wall-clock (between messages) isn't billed.
Alarm invocations count as requests (20 Hz × 5 min × matches). Keep match count modest on free tier.

### 5.4 Simulation step (server)

Per tick (50 ms):
1. For each connected player: read latest input; apply movement (slope tangent / air physics) using shared physics; clamp to map; abyss death.
2. Jetpack fuel regen/consume.
3. Weapons: cooldowns, fire on trigger with validated fire rate; spawn projectiles (bullets as hitscan or fast projectiles; rockets/grenades as physics entities).
4. Projectiles: integrate, collide with map + players, apply damage, spawn explosions.
5. Grenades: fuse timer, bounce, explode.
6. Health/death: on death, increment killer's score, schedule respawn (3 s), drop nothing (MVP).
7. Respawn: after timer, place at spawn point (predefined list per map), reset health/ammo/boost.
8. Match timer decrement; on 0 → status 'ended', broadcast final scores.
9. Build snapshot → broadcast.

**Hitscan vs projectiles:** For bandwidth/CPU, treat bullets as **hitscan raycasts** on server
(validated against player hitboxes at fire time with lag compensation). Rockets/grenades remain
simulated physics entities (low count). This keeps per-tick work small.

### 5.5 Spawn points

Predefined list of world coords on the map (island surfaces). Server picks least-crowded / random.
Client renders spawn effects.

---

## 6. Shared Simulation Module (`shared/`)

Extract from existing client code so server and client use **identical** logic:

| Source | Extract |
|---|---|
| `src/physics.ts` | `resolveCircle`, `isPointInPolygon`, tangent math, abyss check, map polygon loading |
| `src/weapons.ts` | Weapon defs (damage, fireRate, ammo, reload, spread, velocity), `WeaponInstance` state machine |
| `src/map.ts` (data part) | Load `outpost.json`, build collision polys, toWorld conversions, scale constant |
| `src/bot.ts` | (not needed for PvP MVP; keep client-only) |

Shared must be pure TS (no Three.js, no DOM, no Node). Client wraps shared physics with rendering;
server wraps with DO state.

---

## 7. Client Changes

### 7.1 Mode selector (start screen)
Add "SINGLE PLAYER" and "MULTIPLAYER" buttons. Single-player keeps current flow. Multiplayer opens lobby panel:
- Enter nickname (stored in localStorage).
- "Create Room" → calls API → shows room code + waiting list.
- "Join Room" → enter code → join.
- Ready / Start (host only) → server starts match.

### 7.2 Networking layer (`src/net/`)

- `NetworkClient.ts`: WebSocket connect, send/receive, reconnect, heartbeat, message (de)serialization (JSON for MVP; consider binary later).
- `Prediction.ts`: client-side prediction for local player movement + shooting (visual). Maintains input history with sequence numbers; on server snapshot, reconcile (rewind & replay unacked inputs).
- `Interpolation.ts`: buffer remote player snapshots (100 ms), render at interpolated position.

### 7.3 Rendering remote players
Reuse `proceduralModels.ts` soldier meshes. Map server `PlayerState` → mesh transform (pos, aim angle, animation state: idle/walk/fly, firing). Show name tag + health bar above head.

### 7.4 HUD
- Multiplayer scoreboard overlay (kills/deaths, sorted).
- Match timer (server-driven).
- Room code display (host).
- Connection status indicator.
- Kill feed (server events).

### 7.5 Audio
Keep local playback; trigger SFX on local actions and on received events (hit, kill, respawn).

---

## 8. Protocol Spec (WebSocket messages)

All messages are JSON: `{ type, payload, seq?, t }`.

### Client → Server
| type | payload |
|---|---|
| `input` | `{ seq, moveX, moveY, aimAngle, firing, weaponSlot?, reload?, grenade?, melee? }` |
| `chat` (optional) | `{ text }` |
| `ready` | `{}` |
| `start` (host) | `{}` |

### Server → Client
| type | payload |
|---|---|
| `welcome` | `{ playerId, roomCode, players[] }` |
| `player_join` / `player_leave` | `{ playerId, nickname }` |
| `snapshot` | `{ tick, t, players[], projectiles[], match: { timeRemaining, status } }` |
| `event` | `{ kind: 'kill'|'hit'|'respawn'|'weapon_pickup', ... }` |
| `match_end` | `{ scores: [{playerId, kills, deaths}] }` |
| `error` | `{ code, message }` |

Input messages are sent at ~20 Hz (or on change). Snapshots at ~10–15 Hz.

---

## 9. State Shapes (shared/types.ts)

```ts
interface PlayerState {
  id: string;
  nickname: string;
  x: number; y: number;
  vx: number; vy: number;
  aimAngle: number;
  health: number;
  boost: number;
  weaponSlot: number;        // index into loadout
  ammo: number; reserve: number;
  reloading: boolean;
  reloadingUntil: number;    // server time
  alive: boolean;
  respawnAt: number | null;
  kills: number; deaths: number;
  onGround: boolean;
  isBoosting: boolean;
}

interface ProjectileState {
  id: string;
  ownerId: string;
  kind: 'rocket' | 'grenade';
  x: number; y: number;
  vx: number; vy: number;
  fuse: number;             // for grenades
  exploded: boolean;
}

interface InputState {
  seq: number;
  moveX: number;            // -1..1
  moveY: number;            // -1..1 (jetpack)
  aimAngle: number;
  firing: boolean;
  weaponSlot?: number;
  reload?: boolean;
  grenade?: boolean;
  melee?: boolean;
}
```

---

## 10. Latency, Reconciliation & Lag Compensation

- **Client-side prediction** for local player: apply own inputs immediately; keep input buffer.
- **Server reconciliation**: on snapshot, if server position differs beyond threshold, snap/correct and replay unacked inputs.
- **Remote interpolation**: render remote players 100 ms behind latest snapshot with linear interp; handle teleport on large deltas.
- **Lag compensation for hitscan**: server keeps a short history of player positions (~200 ms); on fire, rewind to shooter's view time (clamped) for hit test. (Phase 4+; basic version: server uses current positions.)
- **Input validation**: server rejects out-of-range moveX/moveY, enforces fire rate, ammo, reload timing. Never trust client health/ammo.

---

## 11. Security & Validation

- Validate nickname length/charset.
- Validate room code format.
- Token-based WS auth (playerToken from join response); reject unknown tokens.
- Rate-limit input messages per player (drop excess).
- Server is sole authority for damage, health, score, respawn.
- Sanitize chat text (length cap, strip control chars).
- No secrets in client bundle.

---

## 12. Free-Tier Budget & Optimization Checklist

- Use **WebSocket Hibernation API** (`state.acceptWebSocket`, `webSocketMessage`) so idle rooms cost nothing.
- Stop ticking when room empty or match ended.
- Snapshot rate 10–15 Hz (not 60). Input 20 Hz.
- Hitscan bullets (no per-bullet entity sync); only rockets/grenades are synced entities.
- Delta snapshots: only send changed players/projectiles (Phase 3+ optimization).
- Cap match duration (5 min) and players (8).
- Compress messages (JSON is fine for MVP; consider MessagePack later).
- Monitor usage via Cloudflare dashboard; upgrade to Paid if limits hit.

---

## 13. Phased Implementation Roadmap

### Phase 0 — Audit & shared extraction (1–2 days)
- Verify `npm run build` baseline.
- Extract `shared/` (physics, weapons defs, map data, types) with no DOM/Three deps.
- Update client imports; ensure build still passes.

### Phase 1 — Backend scaffold (1–2 days)
- Init `worker/` with Wrangler; configure DO binding + migration.
- Implement `RoomDO` skeleton: accept WS, echo, hibernation.
- HTTP routes: create/join room, WS upgrade.
- `wrangler dev` + Vite dev proxy; manual two-tab echo test.

### Phase 2 — Lobby & room flow (2–3 days)
- Client lobby UI (create/join by code, nickname, player list, ready).
- Host start; server transitions waiting→running with timer.
- Basic connection status + reconnect.

### Phase 3 — Authoritative movement sync (3–5 days)
- Server tick loop applying inputs with shared physics.
- Client prediction + reconciliation for local player.
- Remote player interpolation.
- Render remote soldiers + name tags.

### Phase 4 — Combat sync (3–5 days)
- Hitscan firing validated server-side; rockets/grenades simulated.
- Health, damage, death, respawn, scoring.
- Kill feed, scoreboard, hit markers, muzzle/SFX events.

### Phase 5 — Polish & hardening (2–4 days)
- Lag compensation (position history).
- Delta snapshots, message compression.
- Mobile/touch support in multiplayer.
- Edge cases: disconnects, host migration (or end match if host leaves), tab backgrounding.
- Load testing with 8 clients.

### Phase 6 — Optional (later)
- Bots to fill empty slots.
- Team Deathmatch mode.
- Public lobby browser / quick play.
- Accounts + leaderboards (D1).
- Cosmetics / weapon pickups.

---

## 14. Risks & Open Questions

- **Free-tier CPU for physics**: 10 ms per invocation on Workers; DO alarm handlers also constrained.
  Mitigation: keep tick work O(players + few projectiles); profile early.
- **Determinism**: shared TS reduces drift; floating point identical (same V8). OK.
- **Host migration**: if host disconnects mid-match, either end match or promote. Plan: end match
  on host disconnect for MVP (simplest); revisit.
- **Reconnect**: player token allows rejoin within 30 s; otherwise slot freed.
- **Mobile performance**: 8 remote meshes + particles may stress low-end devices; LOD/culling later.
- **Asset delivery**: audio files are large; already in `public/`. No change needed.

Open questions for you:
1. Default loadout in PvP: all weapons available (like single-player) or a fixed starting weapon + pickups?
2. Respawn invulnerability window (e.g. 2 s) or none?
3. Friendly fire: N/A for FFA. OK.
4. Should the match auto-restart or return to lobby after end?
5. Do you want a spectator mode for dead players (before respawn)?

---

## 15. Files to Create / Modify (summary)

**New:**
- `shared/{physics,weapons,mapData,types}.ts`
- `src/net/{NetworkClient,Prediction,Interpolation}.ts`
- `src/ui/lobby.*` (or in game.ts)
- `worker/index.ts`, `worker/RoomDO.ts`, `worker/wrangler.toml`
- `MULTIPLAYER_PLAN.md` (this file)

**Modified:**
- `src/game.ts` (mode branch, remote player rendering, HUD, lobby hooks)
- `src/main.ts` (mode selection wiring)
- `src/physics.ts`, `src/weapons.ts`, `src/map.ts` (refactor to use shared; keep client wrappers)
- `index.html` (lobby overlay, scoreboard)
- `package.json` (add wrangler devDependency, scripts)
- `tsconfig.json` (paths for shared)

---

## 16. Verification

- `npm run build` must pass after every phase (client).
- `wrangler dev` (worker) + `npm run dev` (client) for local two-tab testing.
- Manual test matrix: create room → join from second browser → move/aim/fire → kill → respawn → match end → scores.
- Free-tier usage check after a 5-min 2-player match (requests/duration within limits).

---

*End of plan. Review and tell me which phase to start, or any changes to the decisions above.*
