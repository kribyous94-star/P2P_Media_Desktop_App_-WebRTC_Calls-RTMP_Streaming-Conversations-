import { useState, useRef, useCallback, useEffect } from "react";
import { useWsStore } from "@/stores/ws.store.js";
import type { RtmpConfig, RtmpState } from "@p2p/shared";

export type RtmpSource = "camera" | "screen";

export type RtmpLocalStatus =
  | "idle"
  | "acquiring"   // demande accès micro/caméra/écran
  | "connecting"  // envoi rtmp:start, attente FFmpeg
  | "live"        // premier chunk traité par le serveur
  | "error"
  | "stopped";

export interface UseRtmpResult {
  status:         RtmpLocalStatus;
  error:          string | null;
  elapsedSeconds: number;
  startStream:    (config: RtmpConfig, source: RtmpSource) => Promise<void>;
  stopStream:     () => void;
}

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  "480p":  { width: 854,  height: 480  },
  "720p":  { width: 1280, height: 720  },
  "1080p": { width: 1920, height: 1080 },
};

/** Préférence de mimeType selon ce que le navigateur supporte. */
function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=h264,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

export function useRtmp(conversationId: string): UseRtmpResult {
  const [status, setStatus]         = useState<RtmpLocalStatus>("idle");
  const [error, setError]           = useState<string | null>(null);
  const [elapsedSeconds, setElapsed] = useState(0);

  const recorderRef    = useRef<MediaRecorder | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef   = useRef<number>(0);
  const activeRef      = useRef(false); // évite les envois après stopStream

  const wsOn   = useWsStore((s) => s.on);
  const wsSend = useWsStore((s) => s.send);

  // ---- Écoute les mises à jour d'état envoyées par le serveur ----
  useEffect(() => {
    return wsOn("rtmp:state_update", (state: RtmpState) => {
      if (state.conversationId !== conversationId) return;
      if (state.status === "live")  { setStatus("live"); }
      if (state.status === "error") { setStatus("error"); setError(state.error ?? "Erreur serveur"); }
    });
  }, [wsOn, conversationId]);

  // ---- Cleanup du timer elapsed ----
  const clearElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  // ---- Arrêt propre (local + signal serveur) ----
  const stopStream = useCallback(() => {
    activeRef.current = false;

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    clearElapsedTimer();
    setElapsed(0);

    wsSend("rtmp:stop", { conversationId });
    setStatus("stopped");
    setError(null);
  }, [conversationId, wsSend, clearElapsedTimer]);

  // ---- Démarrage du stream ----
  const startStream = useCallback(async (config: RtmpConfig, source: RtmpSource) => {
    setError(null);
    setStatus("acquiring");

    const res = RESOLUTION_MAP[config.resolution] ?? { width: 1280, height: 720 };

    let media: MediaStream;
    try {
      if (source === "screen") {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: { width: res.width, height: res.height, frameRate: config.fps },
          audio: true,
        });
        media = display;
      } else {
        media = await navigator.mediaDevices.getUserMedia({
          video: { width: res.width, height: res.height, frameRate: config.fps },
          audio: true,
        });
      }
    } catch (err) {
      setError("Accès refusé au périphérique de capture");
      setStatus("error");
      return;
    }

    streamRef.current  = media;
    activeRef.current  = true;

    // Informer le serveur — démarre FFmpeg de l'autre côté
    wsSend("rtmp:start", { conversationId, config });
    setStatus("connecting");

    // Démarrer le MediaRecorder avec un timeslice de 500 ms
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(media, {
        mimeType,
        videoBitsPerSecond: config.videoBitrate * 1000,
        audioBitsPerSecond: config.audioBitrate * 1000,
      });
    } catch {
      // Fallback sans options de bitrate si le navigateur ne les supporte pas
      recorder = new MediaRecorder(media, { mimeType });
    }

    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (!activeRef.current || !ev.data || ev.data.size === 0) return;

      // Convertir le Blob en ArrayBuffer puis en base64
      ev.data.arrayBuffer().then((buf) => {
        if (!activeRef.current) return;
        const base64 = btoa(
          new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
        );
        wsSend("rtmp:chunk", { conversationId, data: base64 });
      }).catch(() => {});
    };

    recorder.onerror = () => {
      setError("Erreur MediaRecorder");
      setStatus("error");
      stopStream();
    };

    // Arrêt de la capture si l'utilisateur stoppe le partage d'écran depuis le navigateur
    media.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (activeRef.current) stopStream();
    });

    recorder.start(500); // chunks de 500 ms

    // Timer elapsed time
    startTimeRef.current  = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, [conversationId, wsSend, stopStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeRef.current) stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  return { status, error, elapsedSeconds, startStream, stopStream };
}
