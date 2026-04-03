import { create } from "zustand";
import type { WsServerEvent, ServerPayloadMap, ServerEventType } from "@p2p/shared";

type WsStatus = "disconnected" | "connecting" | "connected" | "error";

// Handlers typés par event
type EventHandler<T extends ServerEventType> = (payload: ServerPayloadMap[T]) => void;
type AnyHandler = (payload: unknown) => void;

interface WsState {
  status: WsStatus;
  socket: WebSocket | null;

  connect: (url: string, token: string) => void;
  disconnect: () => void;
  send: (type: string, payload: unknown) => void;

  // Registre des handlers par event type
  _handlers: Map<string, Set<AnyHandler>>;
  on: <T extends ServerEventType>(type: T, handler: EventHandler<T>) => () => void;
  _emit: (event: WsServerEvent) => void;
}

export const useWsStore = create<WsState>()((set, get) => ({
  status: "disconnected",
  socket: null,
  _handlers: new Map(),

  connect: (url, token) => {
    const existing = get().socket;
    if (existing) {
      existing.close();
    }

    set({ status: "connecting" });

    // Token envoyé dans le query param (pas dans les headers — WebSocket ne les supporte pas)
    const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      set({ status: "connected", socket: ws });
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
      set({ status: "disconnected", socket: null });
    };

    set({ socket: ws });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
    }
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
    if (!_handlers.has(type)) {
      _handlers.set(type, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _handlers.get(type)!.add(handler as any);

    // Retourner une fonction de nettoyage
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _handlers.get(type)?.delete(handler as any);
    };
  },

  _emit: (event) => {
    const { _handlers } = get();
    const handlers = _handlers.get(event.type);
    if (handlers) {
      handlers.forEach((h) => h(event.payload));
    }
  },
}));
