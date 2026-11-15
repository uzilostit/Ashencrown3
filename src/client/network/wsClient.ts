import type { ClientToServerMessage, ServerToClientMessage } from '../../shared/types.ts';

type Listener = (msg: ServerToClientMessage) => void;

const SESSION_KEY = 'ashen_crown_session_v1';

export interface StoredSession {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export class GameWsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(connected: boolean) => void>();
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private intentionallyClosed = false;
  public connected = false;
  public latencyMs = 0;
  private lastPingAt = 0;

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.intentionallyClosed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.notifyStatus(true);
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        this.lastPingAt = performance.now();
        this.send({ type: 'ping' });
      }, 4000);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as ServerToClientMessage;
        if (msg.type === 'pong' && this.lastPingAt > 0) {
          this.latencyMs = Math.round(performance.now() - this.lastPingAt);
        }
        if (msg.type === 'room_joined') {
          const p = msg.payload as { roomCode: string; playerId: string; reconnectToken: string };
          this.saveSession({
            roomCode: p.roomCode,
            playerId: p.playerId,
            reconnectToken: p.reconnectToken,
          });
        }
        for (const fn of this.listeners) fn(msg);
      } catch {
        // ignore malformed packets
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.notifyStatus(false);
      if (this.pingTimer) {
        window.clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (!this.intentionallyClosed) {
        if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
      }
    };
  }

  public send(msg: ClientToServerMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public onMessage(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public onStatus(fn: (connected: boolean) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.connected);
    return () => this.statusListeners.delete(fn);
  }

  private notifyStatus(val: boolean) {
    for (const fn of this.statusListeners) fn(val);
  }

  public saveSession(s: StoredSession | null) {
    try {
      if (!s) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      // ignore storage errors
    }
  }

  public loadSession(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  public close() {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new GameWsClient();
