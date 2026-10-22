// Tiny Militia Web - Room Durable Object (authoritative match). Phase 3/4.

import mapJson from "./data/outpost.json";
import { PhysicsEngine } from "../shared/physics.js";

interface Env {
  MAX_PLAYERS: string;
  MATCH_DURATION_SEC: string;
}

interface MPPlayer {
  id: string;
  nickname: string;
  token: string;
  x: number; y: number;
  vx: number; vy: number;
  aimAngle: number;
  facingRight: boolean;
  health: number; maxHealth: number;
  boost: number; maxBoost: number;
  onGround: boolean;
  isBoosting: boolean;
  alive: boolean;
  respawnAt: number | null;
  invulnUntil: number;
  kills: number; deaths: number;
  weaponSlot: number;
  ammo: number; reserve: number;
  reloading: boolean;
  reloadingUntil: number;
  lastShotTime: number;
  ready: boolean;
  connected: boolean;
  timeSinceLastDamage: number;
}

interface MPInput {
  seq: number;
  moveX: number;
  moveY: number;
  aimAngle: number;
  firing: boolean;
  boost: boolean;
  reload: boolean;
  weaponSlot?: number;
}

const TICK = 1 / 20;
const RADIUS = 0.5;
const WALK_SPEED = 9.0;
const AIR_ACCEL = 24;
const JET_THRUST = 44;
const JET_CONSUME = 38;
const JET_REGEN = 32;
const MAX_FUEL = 100;
const MAX_HEALTH = 100;
const FIRE_RATE = 0.11; // AK-47
const BULLET_DAMAGE = 24;
const BULLET_SPEED = 46;
const RESPAWN_DELAY = 3000;
const INVULN = 2000;

const SPAWNS: [number, number][] = [
  [-17.5, 13.8], [26.0, 16.2], [8.5, 8.8], [-21.5, 1.5],
  [33.5, 2.4], [-53.5, 9.2], [48.0, 11.2], [56.5, -4.7],
];

export class RoomDO {
  private state: DurableObjectState;
  private env: Env;
  private physics: PhysicsEngine;
  private players = new Map<string, MPPlayer>();
  private inputs = new Map<string, MPInput>();
  private wsToPlayer = new Map<WebSocket, string>();
  private hostId: string | null = null;
  private hostToken: string | null = null;
  private status: "waiting" | "running" | "ended" = "waiting";
  private timeRemaining = 0;
  private matchDuration = 300;
  private tickCount = 0;
  private spawnCursor = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.physics = new PhysicsEngine();
    try {
      this.physics.loadMapGeometry(mapJson as any);
    } catch (e) {
      console.error("map load failed", e);
    }
    this.matchDuration = parseInt(env.MATCH_DURATION_SEC || "300", 10);
    this.timeRemaining = this.matchDuration;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      try {
        const body = (await request.json()) as { hostToken?: string };
        this.hostToken = body.hostToken ?? null;
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/info") {
      return new Response(JSON.stringify({ players: this.state.getWebSockets().length, status: this.status }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const token = url.searchParams.get("token") || "";
      const nickname = url.searchParams.get("nickname") || "Player";
      const playerId = crypto.randomUUID();

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      this.state.acceptWebSocket(server, [playerId]);
      server.serializeAttachment({ id: playerId, nickname, token });

      const player = this.createPlayer(playerId, nickname, token);
      this.players.set(playerId, player);
      this.wsToPlayer.set(server, playerId);
      if (!this.hostId) this.hostId = playerId;

      server.send(JSON.stringify({ type: "welcome", payload: { playerId, roomCode: "" , hostId: this.hostId }, t: Date.now() }));
      this.broadcast({ type: "player_join", payload: { playerId, nickname }, t: Date.now() }, server);

      // send current snapshot of players
      this.sendSnapshot(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const playerId = this.wsToPlayer.get(ws);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;

    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return; }

    switch (parsed?.type) {
      case "input": {
        const inp = parsed.payload as MPInput;
        // validate
        const moveX = Math.max(-1, Math.min(1, Number(inp.moveX) || 0));
        const moveY = Math.max(-1, Math.min(1, Number(inp.moveY) || 0));
        const aimAngle = Number(inp.aimAngle) || 0;
        this.inputs.set(playerId, {
          seq: Number(inp.seq) || 0,
          moveX,
          moveY,
          aimAngle,
          firing: !!inp.firing,
          boost: !!inp.boost || moveY > 0.3,
          reload: !!inp.reload,
          weaponSlot: inp.weaponSlot,
        });
        break;
      }
      case "ready": {
        player.ready = true;
        break;
      }
      case "start": {
        if (playerId === this.hostId && this.status === "waiting") {
          this.startMatch();
        }
        break;
      }
      case "chat": {
        const textMsg = String(parsed.payload?.text || "").slice(0, 200);
        this.broadcast({ type: "chat", payload: { playerId, nickname: player.nickname, text: textMsg }, t: Date.now() });
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const playerId = this.wsToPlayer.get(ws);
    if (playerId) {
      const p = this.players.get(playerId);
      if (p) p.connected = false;
      this.wsToPlayer.delete(ws);
      if (p) this.broadcast({ type: "player_leave", payload: { playerId, nickname: p.nickname }, t: Date.now() }, ws);
      if (playerId === this.hostId) {
        // end match on host disconnect
        if (this.status === "running") this.endMatch();
      }
    }
    try { ws.close(code, reason); } catch { /* ignore */ }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    try { ws.close(1011, "error"); } catch { /* ignore */ }
  }

  async alarm(): Promise<void> {
    if (this.status !== "running") return;
    await this.tick();
  }

  private createPlayer(id: string, nickname: string, token: string): MPPlayer {
    const sp = SPAWNS[this.spawnCursor % SPAWNS.length];
    this.spawnCursor++;
    return {
      id, nickname, token,
      x: sp[0], y: sp[1],
      vx: 0, vy: 0,
      aimAngle: 0,
      facingRight: true,
      health: MAX_HEALTH, maxHealth: MAX_HEALTH,
      boost: MAX_FUEL, maxBoost: MAX_FUEL,
      onGround: false,
      isBoosting: false,
      alive: true,
      respawnAt: null,
      invulnUntil: Date.now() + INVULN,
      kills: 0, deaths: 0,
      weaponSlot: 0,
      ammo: 30, reserve: 120,
      reloading: false,
      reloadingUntil: 0,
      lastShotTime: 0,
      ready: false,
      connected: true,
      timeSinceLastDamage: 0,
    };
  }

  private startMatch(): void {
    this.status = "running";
    this.timeRemaining = this.matchDuration;
    this.tickCount = 0;
    // reset players
    let i = 0;
    for (const p of this.players.values()) {
      const sp = SPAWNS[i % SPAWNS.length];
      i++;
      p.x = sp[0]; p.y = sp[1];
      p.vx = 0; p.vy = 0;
      p.health = MAX_HEALTH;
      p.boost = MAX_FUEL;
      p.alive = true;
      p.respawnAt = null;
      p.invulnUntil = Date.now() + INVULN;
      p.kills = 0; p.deaths = 0;
      p.ammo = 30; p.reserve = 120;
      p.reloading = false;
      p.lastShotTime = 0;
    }
    this.broadcast({ type: "match_start", payload: { duration: this.matchDuration }, t: Date.now() });
    this.scheduleTick();
  }

  private scheduleTick(): void {
    if (this.status !== "running") return;
    this.state.storage.setAlarm(Date.now() + TICK * 1000);
  }

  private async tick(): Promise<void> {
    if (this.status !== "running") return;
    const now = Date.now();
    const dt = TICK;

    for (const p of this.players.values()) {
      if (!p.connected || !p.alive) {
        if (!p.alive && p.respawnAt && now >= p.respawnAt) {
          this.respawnPlayer(p, now);
        }
        continue;
      }

      const inp = this.inputs.get(p.id) || { seq: 0, moveX: 0, moveY: 0, aimAngle: p.aimAngle, firing: false, boost: false, reload: false };

      // health regen
      p.timeSinceLastDamage += dt;
      if (p.timeSinceLastDamage >= 2.5 && p.health < MAX_HEALTH) {
        p.health = Math.min(MAX_HEALTH, p.health + 12 * dt);
      }

      // boost
      const boostThrust = inp.boost;
      if (boostThrust && p.boost > 0) {
        p.isBoosting = true;
        p.vy += JET_THRUST * dt;
        p.boost = Math.max(0, p.boost - JET_CONSUME * dt);
      } else {
        p.isBoosting = false;
        if (p.onGround) p.boost = Math.min(MAX_FUEL, p.boost + JET_REGEN * dt);
      }

      p.aimAngle = inp.aimAngle;
      p.facingRight = Math.cos(inp.aimAngle) >= 0;

      // reload
      if (inp.reload && !p.reloading && p.ammo < 30 && p.reserve > 0) {
        p.reloading = true;
        p.reloadingUntil = now + 1400;
      }
      if (p.reloading && now >= p.reloadingUntil) {
        const needed = 30 - p.ammo;
        const take = Math.min(needed, p.reserve);
        p.ammo += take;
        p.reserve -= take;
        p.reloading = false;
      }

      // firing
      if (inp.firing) {
        if (!p.reloading && p.ammo > 0 && (now / 1000 - p.lastShotTime) >= FIRE_RATE) {
          p.ammo -= 1;
          p.lastShotTime = now / 1000;
          // hitscan
          const muzzleX = p.x + Math.cos(p.aimAngle) * 0.95;
          const muzzleY = p.y + 0.7 + Math.sin(p.aimAngle) * 0.95;
          this.doHitscan(p, muzzleX, muzzleY, p.aimAngle);
          // recoil
          p.vx -= Math.cos(p.aimAngle) * 2.5;
          p.vy -= Math.sin(p.aimAngle) * 2.5;
          this.broadcast({ type: "event", payload: { kind: "shot", ownerId: p.id, x: muzzleX, y: muzzleY, angle: p.aimAngle }, t: now });
        } else if (p.ammo <= 0 && !p.reloading && p.reserve > 0) {
          p.reloading = true;
          p.reloadingUntil = now + 1400;
        }
      }

      // movement integration
      const moveX = inp.moveX;
      const walkSpeed = WALK_SPEED;
      if (p.onGround && !p.isBoosting) {
        if (Math.abs(moveX) > 0.05) {
          const gn = this.physics.lastGroundNormal;
          const tLen = Math.hypot(gn.y, -gn.x) || 1;
          const tx = gn.y / tLen;
          const ty = -gn.x / tLen;
          p.vx = moveX * walkSpeed * tx;
          p.vy = moveX * walkSpeed * ty;
          if (moveX * ty <= 0.05) p.vy -= 2.5;
        } else {
          p.vx = 0;
          p.vy = 0;
        }
      } else {
        p.vx += moveX * AIR_ACCEL * dt;
        p.vx = Math.max(-10, Math.min(10, p.vx));
        p.vy -= 28 * dt;
        p.vx *= 0.96;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const vel = { x: p.vx, y: p.vy };
      p.onGround = this.physics.resolveCircle(p as any, RADIUS, vel as any);
      p.vx = vel.x;
      p.vy = vel.y;
    }

    // abyss check
    for (const p of this.players.values()) {
      if (p.alive && p.y < -28) {
        this.killPlayer(p, null, now, "abyss");
      }
    }

    // timer
    this.timeRemaining -= dt;
    this.tickCount++;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.endMatch();
      return;
    }

    this.broadcastSnapshot();
    this.scheduleTick();
  }

  private doHitscan(shooter: MPPlayer, mx: number, my: number, angle: number): void {
    const range = 80;
    const ex = mx + Math.cos(angle) * range;
    const ey = my + Math.sin(angle) * range;
    // find closest hit player along ray
    let best: { p: MPPlayer; t: number } | null = null;
    for (const p of this.players.values()) {
      if (p.id === shooter.id || !p.alive || !p.connected) continue;
      if (now() < p.invulnUntil) continue;
      // circle-line distance
      const t = this.raycastCircle(mx, my, ex, ey, p.x, p.y + 0.7, 0.6);
      if (t !== null && (best === null || t < best.t)) {
        best = { p, t };
      }
    }
    if (best) {
      best.p.health -= BULLET_DAMAGE;
      best.p.timeSinceLastDamage = 0;
      this.broadcast({ type: "event", payload: { kind: "hit", targetId: best.p.id, shooterId: shooter.id, damage: BULLET_DAMAGE }, t: Date.now() });
      if (best.p.health <= 0) {
        this.killPlayer(best.p, shooter, Date.now(), "shot");
      }
    }
  }

  private raycastCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): number | null {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    let disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / (2 * a);
    const t2 = (-b + disc) / (2 * a);
    if (t1 >= 0 && t1 <= 1) return t1;
    if (t2 >= 0 && t2 <= 1) return t2;
    return null;
  }

  private killPlayer(victim: MPPlayer, killer: MPPlayer | null, now: number, reason: string): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.deaths++;
    victim.health = 0;
    if (killer) killer.kills++;
    victim.respawnAt = now + RESPAWN_DELAY;
    this.broadcast({ type: "event", payload: { kind: "kill", victimId: victim.id, killerId: killer?.id || null, reason }, t: now });
  }

  private respawnPlayer(p: MPPlayer, now: number): void {
    const sp = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    p.x = sp[0]; p.y = sp[1];
    p.vx = 0; p.vy = 0;
    p.health = MAX_HEALTH;
    p.boost = MAX_FUEL;
    p.alive = true;
    p.respawnAt = null;
    p.invulnUntil = now + INVULN;
    p.ammo = 30; p.reserve = 120;
    p.reloading = false;
    this.broadcast({ type: "event", payload: { kind: "respawn", playerId: p.id }, t: now });
  }

  private endMatch(): void {
    if (this.status === "ended") return;
    this.status = "ended";
    const scores = [...this.players.values()].map(p => ({ playerId: p.id, nickname: p.nickname, kills: p.kills, deaths: p.deaths }));
    scores.sort((a, b) => b.kills - a.kills);
    this.broadcast({ type: "match_end", payload: { scores }, t: Date.now() });
  }

  private broadcastSnapshot(exclude?: WebSocket): void {
    const now = Date.now();
    const players = [...this.players.values()].map(p => ({
      id: p.id,
      nickname: p.nickname,
      x: p.x, y: p.y,
      vx: p.vx, vy: p.vy,
      aimAngle: p.aimAngle,
      facingRight: p.facingRight,
      health: p.health,
      boost: p.boost,
      weaponSlot: p.weaponSlot,
      ammo: p.ammo, reserve: p.reserve,
      reloading: p.reloading,
      reloadingUntil: p.reloadingUntil,
      alive: p.alive,
      respawnAt: p.respawnAt,
      kills: p.kills, deaths: p.deaths,
      onGround: p.onGround,
      isBoosting: p.isBoosting,
      invulnUntil: p.invulnUntil,
    }));
    this.broadcast({ type: "snapshot", payload: { tick: this.tickCount, t: now, players, match: { timeRemaining: this.timeRemaining, status: this.status } }, t: now }, exclude);
  }

  private sendSnapshot(ws: WebSocket): void {
    const now = Date.now();
    const players = [...this.players.values()].map(p => ({
      id: p.id, nickname: p.nickname,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, aimAngle: p.aimAngle, facingRight: p.facingRight,
      health: p.health, boost: p.boost, weaponSlot: p.weaponSlot, ammo: p.ammo, reserve: p.reserve,
      reloading: p.reloading, reloadingUntil: p.reloadingUntil, alive: p.alive, respawnAt: p.respawnAt,
      kills: p.kills, deaths: p.deaths, onGround: p.onGround, isBoosting: p.isBoosting, invulnUntil: p.invulnUntil,
    }));
    try {
      ws.send(JSON.stringify({ type: "snapshot", payload: { tick: this.tickCount, t: now, players, match: { timeRemaining: this.timeRemaining, status: this.status } }, t: now }));
    } catch { /* ignore */ }
  }

  private broadcast(msg: unknown, exclude?: WebSocket): void {
    const text = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try { ws.send(text); } catch { /* ignore */ }
    }
  }
}

function now() { return Date.now(); }
