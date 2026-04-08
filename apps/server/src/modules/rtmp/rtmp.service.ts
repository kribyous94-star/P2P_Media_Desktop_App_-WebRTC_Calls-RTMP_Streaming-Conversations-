import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import type { RtmpConfig, RtmpState } from "@p2p/shared";

interface StreamEntry {
  process:  ChildProcess;
  state:    RtmpState;
  notified: boolean; // true once we've emitted status "live"
}

const streams = new Map<string, StreamEntry>();

function key(conversationId: string, userId: string) {
  return `${conversationId}:${userId}`;
}

/**
 * Démarre un processus FFmpeg qui lit le WebM streamé sur stdin et l'envoie en RTMP.
 * Retourne l'état initial (status = "connecting").
 */
export function startStream(
  conversationId: string,
  userId: string,
  config: RtmpConfig,
): RtmpState {
  stopStream(conversationId, userId);

  const rtmpUrl = config.serverUrl.endsWith("/")
    ? `${config.serverUrl}${config.streamKey}`
    : `${config.serverUrl}/${config.streamKey}`;

  const resMap: Record<string, string> = {
    "480p":  "854x480",
    "720p":  "1280x720",
    "1080p": "1920x1080",
  };
  const size = resMap[config.resolution] ?? "1280x720";

  const ffmpeg = spawn("ffmpeg", [
    "-re",
    "-f",       "webm",
    "-i",       "pipe:0",
    "-c:v",     "libx264",
    "-preset",  "veryfast",
    "-tune",    "zerolatency",
    "-b:v",     `${config.videoBitrate}k`,
    "-maxrate", `${config.videoBitrate}k`,
    "-bufsize",  `${config.videoBitrate * 2}k`,
    "-vf",      `scale=${size},fps=${config.fps}`,
    "-pix_fmt", "yuv420p",
    "-g",       `${config.fps * 2}`,
    "-c:a",     "aac",
    "-b:a",     `${config.audioBitrate}k`,
    "-ar",      "44100",
    "-f",       "flv",
    rtmpUrl,
  ]);

  const state: RtmpState = {
    conversationId,
    userId,
    status:    "connecting",
    config,
    startedAt: new Date().toISOString(),
  };

  const entry: StreamEntry = { process: ffmpeg, state, notified: false };
  streams.set(key(conversationId, userId), entry);

  ffmpeg.stderr.on("data", (d: Buffer) => {
    // FFmpeg writes progress to stderr — log only for debugging
    const line = d.toString();
    if (line.includes("error") || line.includes("Error")) {
      console.error("[FFmpeg]", line.trim());
    }
  });

  ffmpeg.on("exit", (code) => {
    console.log(`[RTMP] FFmpeg exited (code=${code}) for ${key(conversationId, userId)}`);
    const e = streams.get(key(conversationId, userId));
    if (e) {
      e.state.status    = code === 0 ? "stopped" : "error";
      e.state.stoppedAt = new Date().toISOString();
      if (code !== 0) e.state.error = `FFmpeg exited with code ${code}`;
      streams.delete(key(conversationId, userId));
    }
  });

  return state;
}

/**
 * Écrit un chunk WebM sur stdin de FFmpeg.
 * Retourne "firstChunk" lors du premier write réussi (transition connecting → live),
 * "ok" pour les suivants, "error" si le process n'est pas disponible.
 */
export function writeChunk(
  conversationId: string,
  userId: string,
  data: Buffer,
): "ok" | "firstChunk" | "error" {
  const entry = streams.get(key(conversationId, userId));
  if (!entry || !entry.process.stdin?.writable) return "error";

  try {
    entry.process.stdin.write(data);
    if (!entry.notified) {
      entry.state.status = "live";
      entry.notified     = true;
      return "firstChunk";
    }
    return "ok";
  } catch (err) {
    console.error("[RTMP] writeChunk error:", err);
    return "error";
  }
}

/**
 * Arrête proprement le stream : ferme stdin puis SIGKILL après 3 s si nécessaire.
 */
export function stopStream(conversationId: string, userId: string): RtmpState | null {
  const k     = key(conversationId, userId);
  const entry = streams.get(k);
  if (!entry) return null;

  const state: RtmpState = {
    ...entry.state,
    status:    "stopped",
    stoppedAt: new Date().toISOString(),
  };

  try {
    if (entry.process.stdin?.writable) entry.process.stdin.end();
    const timer = setTimeout(() => {
      try { entry.process.kill("SIGKILL"); } catch {}
    }, 3000);
    entry.process.once("exit", () => clearTimeout(timer));
  } catch {}

  streams.delete(k);
  return state;
}

/** Retourne l'état courant d'un stream, ou null s'il n'existe pas. */
export function getState(conversationId: string, userId: string): RtmpState | null {
  return streams.get(key(conversationId, userId))?.state ?? null;
}

/** Arrête tous les streams actifs de cet utilisateur (appelé à la déconnexion WS). */
export function stopAll(userId: string): void {
  for (const [k, entry] of streams.entries()) {
    if (entry.state.userId === userId) {
      try {
        if (entry.process.stdin?.writable) entry.process.stdin.end();
        setTimeout(() => { try { entry.process.kill("SIGKILL"); } catch {} }, 1000);
      } catch {}
      streams.delete(k);
    }
  }
}
