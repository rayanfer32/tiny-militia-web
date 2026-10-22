// Tiny Militia Web - Worker entry (HTTP + WS upgrade). Phase 1 skeleton.

export { RoomDO } from "./RoomDO.js";

interface Env {
  ROOMS: DurableObjectNamespace;
  MAX_PLAYERS: string;
  MATCH_DURATION_SEC: string;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Create room
    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const code = genCode();
      const hostToken = crypto.randomUUID();
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      await stub.fetch(new Request("https://do/init", {
        method: "POST",
        body: JSON.stringify({ hostToken }),
        headers: { "content-type": "application/json" },
      }));
      return json({ code, hostToken, wsPath: `/ws/${code}` });
    }

    // Join room
    const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/join$/);
    if (request.method === "POST" && joinMatch) {
      const code = joinMatch[1];
      let nickname = "Player";
      try {
        const body = (await request.json()) as { nickname?: string };
        if (body?.nickname) nickname = String(body.nickname).slice(0, 24);
      } catch {
        // ignore
      }
      const playerToken = crypto.randomUUID();
      return json({
        code,
        playerToken,
        nickname,
        wsUrl: `/ws/${code}?token=${playerToken}&nickname=${encodeURIComponent(nickname)}`,
      });
    }

    // Room info
    const infoMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})$/);
    if (request.method === "GET" && infoMatch) {
      const code = infoMatch[1];
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      const res = await stub.fetch(new Request("https://do/info"));
      const data = await res.json();
      return json({ code, ...(data as object) });
    }

    // WebSocket upgrade
    const wsMatch = url.pathname.match(/^\/ws\/([A-Z0-9]{6})$/);
    if (wsMatch) {
      const code = wsMatch[1];
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};