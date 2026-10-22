# Backend Architecture — Tiny Militia Multiplayer

Companion to `MULTIPLAYER_PLAN.md` and `CHECKPOINT.md`. Describes how the Cloudflare Worker + Durable Object backend works.

## 1. High-level architecture

```mermaid
flowchart LR
  subgraph Client["Browser (Vite + Three.js)"]
    SP[Single-player path]
    MP[Multiplayer client<br/>prediction + interpolation]
    NC[NetworkClient<br/>WebSocket]
  end

  subgraph Edge["Cloudflare Edge"]
    W[Worker entry<br/>index.ts<br/>HTTP + WS upgrade]
  end

  subgraph DO["Durable Object (one per room)"]
    R[RoomDO<br/>authoritative simulation]
    S[(SQLite state<br/>hibernation)]
  end

  MP -->|HTTP create/join| W
  MP <-->|WebSocket wss://| W
  W -->|stub.fetch / WS upgrade| R
  R --- S
  W -->|static assets| Pages[Cloudflare Pages]
```

## 2. Request & connection flow

```mermaid
sequenceDiagram
  participant C as Client
  participant W as Worker (index.ts)
  participant R as RoomDO

  C->>W: POST /api/rooms (nickname)
  W->>W: genCode() -> 6-char code
  W->>R: stub.fetch /init (hostToken)
  R-->>W: { ok }
  W-->>C: { code, hostToken, wsPath }

  C->>W: POST /api/rooms/:code/join (nickname)
  W-->>C: { code, playerToken, wsUrl }

  C->>W: GET Upgrade: websocket /ws/:code?token&nickname
  W->>R: stub.fetch(request) (forwarded)
  R->>R: acceptWebSocket (hibernation)
  R->>R: createPlayer, wsToPlayer map
  R-->>C: 101 Switching Protocols
  R-->>C: welcome { playerId, hostId }
  R-->>C: player_join (broadcast)
  R-->>C: snapshot (current state)
```

## 3. RoomDO lifecycle (state machine)

```mermaid
stateDiagram-v2
  [*] --> waiting: DO created on first /init
  waiting --> running: host sends "start"
  running --> running: tick loop (alarm every 50ms)
  running --> ended: timeRemaining <= 0
  running --> ended: host disconnects
  ended --> [*]: DO hibernates when empty
  waiting --> [*]: empty room hibernates
```

## 4. Authoritative tick loop (20 Hz)

```mermaid
flowchart TD
  A["alarm fires"] --> B{"status == running?"}
  B -- no --> Z["stop scheduling, hibernate"]
  B -- yes --> T["tick()"]
  T --> P1["For each connected player"]
  P1 --> I["Read latest input"]
  I --> HP["Health regen"]
  HP --> BST["Jetpack consume/regen"]
  BST --> RLD["Reload timer"]
  RLD --> FIR{"firing?"}
  FIR -- yes --> HS["Hitscan raycast"]
  HS --> EV["broadcast shot/hit/kill"]
  FIR -- no --> MV["Movement integration"]
  EV --> MV
  MV --> COL["resolveCircle vs map"]
  COL --> ABY{"y less than -28?"}
  ABY -- yes --> KILL["killPlayer abyss"]
  ABY -- no --> NXT["next player"]
  KILL --> NXT
  NXT --> P1
  P1 --> RSP["Respawn timers"]
  RSP --> TIM["Decrement timer"]
  TIM --> END{"timeRemaining <= 0?"}
  END -- yes --> EM["endMatch"]
  END -- no --> SNAP["broadcastSnapshot"]
  SNAP --> SCH["scheduleTick"]
  SCH --> A
```

## 5. Data flow per player input

```mermaid
flowchart LR
  K["Keyboard/Touch"] --> SI["sendMpInput 20Hz"]
  SI --> WS["WebSocket input msg"]
  WS --> R["RoomDO.webSocketMessage"]
  R --> V["Validate inputs"]
  V --> BUF["inputs.set playerId"]
  BUF --> TICK["tick reads input"]
  TICK --> SIM["Shared physics sim"]
  SIM --> SNAP["snapshot 10-15Hz"]
  SNAP --> C["Client applySnapshot"]
  C --> REC["Reconcile if drift"]
  C --> INT["Interpolate remote players"]
```

## 6. WebSocket message protocol

### Client -> Server
| type | payload |
|---|---|
| `input` | `{ seq, moveX, moveY, aimAngle, firing, boost, reload, weaponSlot? }` |
| `ready` | `{}` |
| `start` (host) | `{}` |
| `chat` | `{ text }` |

### Server -> Client
| type | payload |
|---|---|
| `welcome` | `{ playerId, hostId }` |
| `player_join` / `player_leave` | `{ playerId, nickname }` |
| `snapshot` | `{ tick, t, players[], match }` |
| `event` | `{ kind: shot\|hit\|kill\|respawn, ... }` |
| `match_start` | `{ duration }` |
| `match_end` | `{ scores[] }` |
| `chat` | `{ playerId, nickname, text }` |

## 7. Hibernation & cost model

```mermaid
flowchart TD
  E["Empty or ended room"] --> H["DO hibernates"]
  A["Incoming WS or alarm"] --> W["DO wakes"]
  W --> P["Process, broadcast"]
  P --> E2{"still active?"}
  E2 -- yes --> A
  E2 -- no --> H
```

- WebSocket connection setup counts as a request.
- Incoming WS messages bill at 20:1 ratio (100 msgs ≈ 5 requests).
- Alarms (20 Hz × 5 min) drive the tick loop only while `running`.
- Snapshots broadcast at 10–15 Hz to all connected clients.

## 8. Key files
| File | Role |
|---|---|
| `worker/index.ts` | Stateless glue: create/join room, WS upgrade, route to DO stub |
| `worker/RoomDO.ts` | Authoritative sim: players, inputs, tick loop, hitscan, health, death, respawn, timer, broadcast |
| `worker/data/outpost.json` | Map collision data (duplicate of `public/data/outpost.json`) |
| `shared/physics.ts` | Shared collision/physics (used by client + server) |
| `shared/weapons.ts` | Weapon definitions (client uses; server hardcodes subset) |
| `shared/types.ts` | Shared net/state types |
| `src/net/NetworkClient.ts` | Client WebSocket + HTTP API client |
