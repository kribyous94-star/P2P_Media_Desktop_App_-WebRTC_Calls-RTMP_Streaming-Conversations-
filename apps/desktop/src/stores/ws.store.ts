import { create } from "zustand";
import type { WsServerEvent, ServerPayloadMap, ServerEventType } from "@p2p/shared";

type WsStatus = "disconnected" | "connecting" | "connected" | "error";

type EventHandler<T extends ServerEventType> = (payload: ServerPayloadMap[T]) => void;
type AnyHandler = (payload: unknown) => void;

const HEARTBEAT_MS  = 25_000; // ping toutes les 25 s (nginx timeout = 60 s)
const RECONNECT_MS  = 3_000;  // délai de reconnexion après une déco inattendue

interface WsState {
  status: WsStatus;
  socket: WebSocket | null;

  connect:    (url: string, token: string) => void;
  disconnect: () => void;
  send:       (type: string, payload: unknown) => void;

  _handlers:  Map<string, Set<AnyHandler>>;
  on: <T extends ServerEventType>(type: T, handler: EventHandler<T>) => () => void;
  _emit: (event: WsServerEvent) => void;

  // Internals pour reconnexion
  _url:                  string | null;
  _token:                string | null;
  _intentionalClose:     boolean;
  _reconnectTimer:       ReturnType<typeof setTimeout> | null;
  _heartbeatTimer:       ReturnType<typeof setInterval> | null;
}

export const useWsStore = create<WsState>()((set, get) => ({
  status:  "disconnected",
  socket:  null,
  _handlers: new Map(),
  _url:    null,
  _token:  null,
  _intentionalClose: false,
  _reconnectTimer:   null,
  _heartbeatTimer:   null,

  connect: (url, token) => {
    // Annuler toute reconnexion en attente
    const prev = get();
    if (prev._reconnectTimer) clearTimeout(prev._reconnectTimer);
    if (prev._heartbeatTimer) clearInterval(prev._heartbeatTimer);
    // Neutraliser l'ancien socket sans déclencher la logique de reconnexion
    if (prev.socket) {
      prev.socket.onclose = null;
      prev.socket.onerror = null;
      prev.socket.close();
    }

    set({ status: "connecting", _url: url, _token: token, _intentionalClose: false });

    const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      // Démarrer le heartbeat pour passer au-dessus du proxy_read_timeout nginx (60 s)
      const heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", payload: {} }));
        }
      }, HEARTBEAT_MS);
      set({ status: "connected", socket: ws, _heartbeatTimer: heartbeatTimer });
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WsServerEvent;
        get()._emit(data);
      } catch {
        console.error("[WS] Failed to parse message", event.data);
      }
    };

    ws.onerror = () => {
      set({ status: "error" });
    };

    ws.onclose = () => {
      const { _heartbeatTimer, _intentionalClose, _url, _token } = get();
      if (_heartbeatTimer) clearInterval(_heartbeatTimer);
      set({ status: "disconnected", socket: null, _heartbeatTimer: null });

      if (_intentionalClose) {
        set({ _intentionalClose: false });
        return;
      }

      // Reconnexion automatique
      if (_url && _token) {
        console.log(`[WS] Connexion perdue — reconnexion dans ${RECONNECT_MS / 1000} s…`);
        const timer = setTimeout(() => {
          get().connect(_url, _token);
        }, RECONNECT_MS);
        set({ _reconnectTimer: timer });
      }
    };

    set({ socket: ws });
  },

  disconnect: () => {
    const { socket, _heartbeatTimer, _reconnectTimer } = get();
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    set({ _intentionalClose: true, _url: null, _token: null, _reconnectTimer: null, _heartbeatTimer: null });
    if (socket) socket.close();
    set({ socket: null, status: "disconnected" });
  },

  send: (type, payload) => {
    const { socket, status } = get();
    if (!socket || status !== "connected") {
      console.warn("[WS] Cannot send — not connected");
      return;
    }
    socket.send(JSON.stringify({ type, payload }));
  },

  on: (type, handler) => {
    const { _handlers } = get();
    if (!_handlers.has(type)) _handlers.set(type, new Set());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _handlers.get(type)!.add(handler as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _handlers.get(type)?.delete(handler as any);
    };
  },

  _emit: (event) => {
    const handlers = get()._handlers.get(event.type);
    if (handlers) handlers.forEach((h) => h(event.payload));
  },
}));
