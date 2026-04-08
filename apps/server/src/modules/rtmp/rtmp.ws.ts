import type { WebSocket } from "ws";
import { connectionRegistry } from "../../websocket/registry.js";
import * as rtmpService from "./rtmp.service.js";
import type { RtmpConfig } from "@p2p/shared";

// ---- rtmp:start ----

export function handleRtmpStart(
  connectionId: string,
  userId: string,
  socket: WebSocket,
  payload: unknown,
) {
  const { conversationId, config } = (payload ?? {}) as {
    conversationId?: string;
    config?:         Partial<RtmpConfig>;
  };

  if (!conversationId || !config?.serverUrl || !config?.streamKey) {
    socket.send(JSON.stringify({
      type:    "error",
      payload: { code: "INVALID_RTMP_CONFIG", message: "conversationId, serverUrl and streamKey are required" },
    }));
    return;
  }

  if (!connectionRegistry.getConversations(connectionId).includes(conversationId)) {
    socket.send(JSON.stringify({
      type:    "error",
      payload: { code: "NOT_IN_ROOM", message: "Join the conversation first" },
    }));
    return;
  }

  const fullConfig: RtmpConfig = {
    serverUrl:    config.serverUrl,
    streamKey:    config.streamKey,
    videoBitrate: config.videoBitrate ?? 2500,
    audioBitrate: config.audioBitrate ?? 128,
    resolution:   config.resolution   ?? "720p",
    fps:          config.fps          ?? 30,
  };

  const state = rtmpService.startStream(conversationId, userId, fullConfig);
  socket.send(JSON.stringify({ type: "rtmp:state_update", payload: state }));
}

// ---- rtmp:chunk ----

export function handleRtmpChunk(
  _connectionId: string,
  userId: string,
  socket: WebSocket,
  payload: unknown,
) {
  const { conversationId, data } = (payload ?? {}) as {
    conversationId?: string;
    data?:           string; // base64
  };

  if (!conversationId || !data) return;

  const buf    = Buffer.from(data, "base64");
  const result = rtmpService.writeChunk(conversationId, userId, buf);

  // Notifier le client uniquement lors de la transition connecting → live
  if (result === "firstChunk") {
    const state = rtmpService.getState(conversationId, userId);
    if (state) socket.send(JSON.stringify({ type: "rtmp:state_update", payload: state }));
  } else if (result === "error") {
    socket.send(JSON.stringify({
      type:    "rtmp:state_update",
      payload: { conversationId, userId, status: "error", error: "FFmpeg process unavailable" },
    }));
  }
}

// ---- rtmp:stop ----

export function handleRtmpStop(
  _connectionId: string,
  userId: string,
  socket: WebSocket,
  payload: unknown,
) {
  const { conversationId } = (payload ?? {}) as { conversationId?: string };
  if (!conversationId) return;

  const state = rtmpService.stopStream(conversationId, userId) ?? {
    conversationId,
    userId,
    status:    "stopped" as const,
    stoppedAt: new Date().toISOString(),
  };

  socket.send(JSON.stringify({ type: "rtmp:state_update", payload: state }));
}
