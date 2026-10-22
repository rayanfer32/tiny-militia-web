// Tiny Militia Web - Multiplayer network client (Phase 2 skeleton)

export type MsgHandler = (msg: any) => void;

export class NetworkClient {
  private apiBase: string;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MsgHandler>>();
  private anyHandlers = new Set<MsgHandler>();

  constructor(apiBase?: string) {
    this.apiBase = apiBase || (import.meta as any).env?.VITE_MP_API_BASE || "http://localhost:8787";
  }

  get base(): string {
    return this.apiBase;
  }

  async createRoom(nickname: string): Promise<{ code: string; hostToken: string; wsPath: string }> {
    const res = await fetch(`${this.apiBase}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    if (!res.ok) throw new Error(`createRoom failed: ${res.status}`);
    return res.json();
  }

  async joinRoom(code: string, nickname: string): Promise<{ code: string; playerToken: string; wsUrl: string }> {
    const res = await fetch(`${this.apiBase}/api/rooms/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    if (!res.ok) throw new Error(`joinRoom failed: ${res.status}`);
    return res.json();
  }

  async roomInfo(code: string): Promise<any> {
    const res = await fetch(`${this.apiBase}/api/rooms/${code}`);
    if (!res.ok) throw new Error(`roomInfo failed: ${res.status}`);
    return res.json();
  }

  connect(wsUrl: string): void {
    const url = wsUrl.startsWith("ws") ? wsUrl : `${this.apiBase.replace(/^http/, "ws")}${wsUrl}`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.dispatch({ type: "open" });
    this.ws.onclose = (e) => this.dispatch({ type: "close", code: e.code, reason: e.reason });
    this.ws.onerror = () => this.dispatch({ type: "error" });
    this.ws.onmessage = (e) => {
      let msg: any = e.data;
      try { msg = JSON.parse(e.data); } catch { /* keep raw */ }
      this.dispatch(msg);
      for (const h of this.anyHandlers) h(msg);
    };
  }

  send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type: string, handler: MsgHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  onAny(handler: MsgHandler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  close(): void {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  private dispatch(msg: any): void {
    const set = this.handlers.get(msg?.type);
    if (set) for (const h of set) h(msg);
  }
}