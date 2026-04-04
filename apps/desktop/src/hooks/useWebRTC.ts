import { useState, useRef, useEffect, useCallback } from "react";
import { useWsStore } from "@/stores/ws.store.js";
import type { SignalMessage, SignalType } from "@p2p/shared";

export type CallStatus = "idle" | "calling" | "incoming" | "in-call";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useWebRTC(conversationId: string, currentUserId: string) {
  const [status, setStatus]           = useState<CallStatus>("idle");
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [callError, setCallError]     = useState<string | null>(null);

  // Refs for values needed inside closures
  const pcRef              = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates  = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef    = useRef<{ sdp: string; fromUserId: string } | null>(null);
  const remoteUserIdRef    = useRef<string | null>(null);
  const localStreamRef     = useRef<MediaStream | null>(null);

  const wsOn   = useWsStore((s) => s.on);
  const wsSend = useWsStore((s) => s.send);

  // ---- Helpers ----

  const sendSignal = useCallback((
    type: SignalType,
    targetUserId: string,
    payload: unknown
  ) => {
    wsSend("webrtc:signal", {
      type,
      conversationId,
      fromPeerId: currentUserId,
      toPeerId:   targetUserId,
      payload,
    } as SignalMessage);
  }, [wsSend, conversationId, currentUserId]);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current   = null;
    remoteUserIdRef.current  = null;
    pendingOfferRef.current  = null;
    pendingCandidates.current = [];
    pcRef.current?.close();
    pcRef.current = null;

    setStatus("idle");
    setRemoteUserId(null);
    setLocalStream(null);
    setRemoteStream(null);
    setAudioEnabled(true);
    setVideoEnabled(true);
    // callError n'est pas réinitialisé ici — il persiste jusqu'à la prochaine action
  }, []);

  // Keep a stable ref to cleanup to call in the unmount effect
  const cleanupRef = useRef(cleanup);
  useEffect(() => { cleanupRef.current = cleanup; });

  const createPC = useCallback((targetUserId: string): RTCPeerConnection => {
    pcRef.current?.close();

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal("ice-candidate", targetUserId, {
          candidate:       candidate.candidate,
          sdpMid:          candidate.sdpMid,
          sdpMLineIndex:   candidate.sdpMLineIndex,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? null);
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        cleanupRef.current();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal]);

  // ---- Public API ----

  /** Acquire best available media stream: video+audio → audio only → error */
  async function getMedia(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch {
      // Fallback audio-only (pas de caméra, ou caméra refusée)
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  }

  /** Initiate a call to targetUserId */
  const startCall = useCallback(async (targetUserId: string) => {
    setCallError(null);
    try {
      const stream = await getMedia();
      localStreamRef.current  = stream;
      remoteUserIdRef.current = targetUserId;
      setLocalStream(stream);
      setRemoteUserId(targetUserId);
      setStatus("calling");

      const pc = createPC(targetUserId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // call-request carries the offer so the callee can answer without an extra round-trip
      sendSignal("call-request", targetUserId, { sdp: offer.sdp });
    } catch (err) {
      console.error("[WebRTC] startCall:", err);
      const msg = err instanceof DOMException
        ? (err.name === "NotAllowedError"
            ? "Accès micro/caméra refusé — vérifie les permissions du navigateur"
            : "Aucun micro détecté — branche un micro et réessaie")
        : "Impossible de démarrer l'appel";
      cleanupRef.current();
      setCallError(msg);  // après cleanup pour ne pas être écrasé
    }
  }, [createPC, sendSignal]);

  /** Accept the pending incoming call */
  const acceptCall = useCallback(async () => {
    const pending = pendingOfferRef.current;
    if (!pending) return;
    setCallError(null);
    try {
      const stream = await getMedia();
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPC(pending.fromUserId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription({ type: "offer", sdp: pending.sdp });

      // Drain queued ICE candidates
      for (const c of pendingCandidates.current) {
        await pc.addIceCandidate(c).catch(() => {});
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal("call-accept", pending.fromUserId, { sdp: answer.sdp });
      setStatus("in-call");
    } catch (err) {
      console.error("[WebRTC] acceptCall:", err);
      cleanupRef.current();
      setCallError("Impossible d'accepter l'appel — vérifie ton micro");
    }
  }, [createPC, sendSignal]);

  /** Reject incoming call */
  const rejectCall = useCallback(() => {
    const pending = pendingOfferRef.current;
    if (pending) sendSignal("call-reject", pending.fromUserId, {});
    cleanupRef.current();
  }, [sendSignal]);

  /** Hang up (caller or callee) */
  const hangUp = useCallback(() => {
    const target = remoteUserIdRef.current;
    if (target) sendSignal("call-end", target, {});
    cleanupRef.current();
  }, [sendSignal]);

  const toggleAudio = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setAudioEnabled((v) => !v);
  }, []);

  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setVideoEnabled((v) => !v);
  }, []);

  // ---- WS signal handler ----

  useEffect(() => {
    const off = wsOn("webrtc:signal", (signal: SignalMessage) => {
      if (signal.conversationId !== conversationId) return;
      if (signal.toPeerId && signal.toPeerId !== currentUserId) return;

      const handle = async () => {
        switch (signal.type) {
          case "call-request": {
            const { sdp } = signal.payload as { sdp: string };
            pendingOfferRef.current = { sdp, fromUserId: signal.fromPeerId };
            remoteUserIdRef.current = signal.fromPeerId;
            setRemoteUserId(signal.fromPeerId);
            setStatus("incoming");
            break;
          }

          case "call-accept": {
            const { sdp } = signal.payload as { sdp: string };
            const pc = pcRef.current;
            if (!pc) break;
            await pc.setRemoteDescription({ type: "answer", sdp });
            for (const c of pendingCandidates.current) {
              await pc.addIceCandidate(c).catch(() => {});
            }
            pendingCandidates.current = [];
            setStatus("in-call");
            break;
          }

          case "call-reject":
          case "call-end":
            cleanupRef.current();
            break;

          case "ice-candidate": {
            const init = signal.payload as RTCIceCandidateInit;
            const pc = pcRef.current;
            if (pc?.remoteDescription) {
              await pc.addIceCandidate(init).catch(() => {});
            } else {
              pendingCandidates.current.push(init);
            }
            break;
          }
        }
      };

      void handle();
    });

    return off;
  }, [conversationId, currentUserId, wsOn]);

  // Cleanup on unmount or conversation switch
  useEffect(() => {
    return () => { cleanupRef.current(); };
  }, [conversationId]);

  return {
    status,
    callError,
    remoteUserId,
    localStream,
    remoteStream,
    audioEnabled,
    videoEnabled,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleAudio,
    toggleVideo,
  };
}
