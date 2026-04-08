import { useState, useRef, useEffect, useCallback } from "react";
import { useWsStore } from "@/stores/ws.store.js";
import { useCallStore } from "@/stores/call.store.js";
import type { SignalMessage, SignalType } from "@p2p/shared";

export type CallStatus = "idle" | "calling" | "incoming" | "in-call";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface MediaResult {
  stream: MediaStream;
  hasAudio: boolean;
  hasVideo: boolean;
}

/**
 * Acquiert le micro et/ou la caméra de manière indépendante.
 * Ne lève jamais d'exception — renvoie un stream vide si aucune permission.
 */
async function getMediaSafe(): Promise<MediaResult> {
  const stream = new MediaStream();
  let gotAudio = false;
  let gotVideo = false;

  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const t = s.getAudioTracks()[0];
    if (t) { stream.addTrack(t); gotAudio = true; }
  } catch { /* micro refusé ou absent */ }

  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    const t = s.getVideoTracks()[0];
    if (t) { stream.addTrack(t); gotVideo = true; }
  } catch { /* caméra refusée ou absente */ }

  return { stream, hasAudio: gotAudio, hasVideo: gotVideo };
}

export function useWebRTC(conversationId: string, currentUserId: string, callerName?: string) {
  const [status, setStatus]             = useState<CallStatus>("idle");
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [localStream, setLocalStream]   = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [hasAudio, setHasAudio]         = useState(false);
  const [hasVideo, setHasVideo]         = useState(false);
  const [callError, setCallError]       = useState<string | null>(null);

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
    setAudioEnabled(false);
    setVideoEnabled(false);
    setHasAudio(false);
    setHasVideo(false);
  }, []);

  const cleanupRef = useRef(cleanup);
  useEffect(() => { cleanupRef.current = cleanup; });

  const createPC = useCallback((targetUserId: string): RTCPeerConnection => {
    pcRef.current?.close();

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal("ice-candidate", targetUserId, {
          candidate:     candidate.candidate,
          sdpMid:        candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
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

    // Renegociation mid-call (track ajouté après la connexion initiale)
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== "stable") return;
      const target = remoteUserIdRef.current;
      if (!target) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal("call-reoffer", target, { sdp: offer.sdp, sdpType: "offer" });
      } catch (err) {
        console.error("[WebRTC] onnegotiationneeded:", err);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal]);

  // ---- Helpers internes ----

  function applyMedia(
    pc: RTCPeerConnection,
    stream: MediaStream,
    gotAudio: boolean,
    gotVideo: boolean,
  ) {
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    // Transceivers recvonly pour les médias non envoyés (SDP inclura ces m-lines)
    if (!gotAudio) pc.addTransceiver("audio", { direction: "recvonly" });
    if (!gotVideo) pc.addTransceiver("video", { direction: "recvonly" });
  }

  // ---- Public API ----

  const startCall = useCallback(async (targetUserId: string) => {
    setCallError(null);
    const { stream, hasAudio: gotAudio, hasVideo: gotVideo } = await getMediaSafe();
    localStreamRef.current  = stream;
    remoteUserIdRef.current = targetUserId;
    setLocalStream(gotVideo ? stream : null);
    setRemoteUserId(targetUserId);
    setHasAudio(gotAudio);
    setHasVideo(gotVideo);
    setAudioEnabled(gotAudio);
    setVideoEnabled(gotVideo);
    setStatus("calling");

    const pc = createPC(targetUserId);
    applyMedia(pc, stream, gotAudio, gotVideo);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal("call-request", targetUserId, { sdp: offer.sdp, callerName: callerName ?? currentUserId });
  }, [createPC, sendSignal, callerName, currentUserId]);

  const acceptCall = useCallback(async () => {
    const pending = pendingOfferRef.current;
    if (!pending) return;
    setCallError(null);

    const { stream, hasAudio: gotAudio, hasVideo: gotVideo } = await getMediaSafe();
    localStreamRef.current = stream;
    setLocalStream(gotVideo ? stream : null);
    setHasAudio(gotAudio);
    setHasVideo(gotVideo);
    setAudioEnabled(gotAudio);
    setVideoEnabled(gotVideo);

    const pc = createPC(pending.fromUserId);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    await pc.setRemoteDescription({ type: "offer", sdp: pending.sdp });

    for (const c of pendingCandidates.current) {
      await pc.addIceCandidate(c).catch(() => {});
    }
    pendingCandidates.current = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal("call-accept", pending.fromUserId, { sdp: answer.sdp });
    setStatus("in-call");
  }, [createPC, sendSignal]);

  const rejectCall = useCallback(() => {
    const pending = pendingOfferRef.current;
    if (pending) sendSignal("call-reject", pending.fromUserId, {});
    cleanupRef.current();
  }, [sendSignal]);

  const hangUp = useCallback(() => {
    const target = remoteUserIdRef.current;
    if (target) sendSignal("call-end", target, {});
    cleanupRef.current();
  }, [sendSignal]);

  /**
   * Mute/unmute le micro.
   * Si le device n'est pas encore accordé, demande la permission.
   * Async car elle peut déclencher un prompt navigateur.
   */
  const toggleAudio = useCallback(async () => {
    if (!hasAudio) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const track = s.getAudioTracks()[0];
        if (!track) return;
        localStreamRef.current?.addTrack(track);
        if (pcRef.current && localStreamRef.current) {
          pcRef.current.addTrack(track, localStreamRef.current);
          // onnegotiationneeded se déclenchera automatiquement
        }
        setHasAudio(true);
        setAudioEnabled(true);
      } catch { /* refusé — rester inactif */ }
      return;
    }
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setAudioEnabled((v) => !v);
  }, [hasAudio]);

  /**
   * Activate/désactive la caméra.
   * Si le device n'est pas encore accordé, demande la permission.
   */
  const toggleVideo = useCallback(async () => {
    if (!hasVideo) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        const track = s.getVideoTracks()[0];
        if (!track) return;
        localStreamRef.current?.addTrack(track);
        if (pcRef.current && localStreamRef.current) {
          pcRef.current.addTrack(track, localStreamRef.current);
        }
        setHasVideo(true);
        setVideoEnabled(true);
        setLocalStream(localStreamRef.current);
      } catch { /* refusé — rester inactif */ }
      return;
    }
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setVideoEnabled((v) => !v);
  }, [hasVideo]);

  // ---- Reprendre une offre stockée globalement (appel reçu hors conversation) ----
  useEffect(() => {
    const { incoming, setIncoming } = useCallStore.getState();
    if (incoming && incoming.conversationId === conversationId) {
      pendingOfferRef.current  = { sdp: incoming.sdp, fromUserId: incoming.fromUserId };
      remoteUserIdRef.current  = incoming.fromUserId;
      setRemoteUserId(incoming.fromUserId);
      setStatus("incoming");
      setIncoming(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // uniquement au montage

  // ---- WS signal handler ----

  useEffect(() => {
    const off = wsOn("webrtc:signal", (signal: SignalMessage) => {
      if (signal.conversationId !== conversationId) return;
      if (signal.toPeerId && signal.toPeerId !== currentUserId) return;

      const handle = async () => {
        switch (signal.type) {
          case "call-request": {
            const { sdp } = signal.payload as { sdp: string; callerName?: string };
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

          case "call-reoffer": {
            const { sdp, sdpType } = signal.payload as { sdp: string; sdpType: "offer" | "answer" };
            const pc = pcRef.current;
            if (!pc) break;
            if (sdpType === "offer") {
              await pc.setRemoteDescription({ type: "offer", sdp });
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal("call-reoffer", signal.fromPeerId, { sdp: answer.sdp, sdpType: "answer" });
            } else if (sdpType === "answer" && pc.signalingState === "have-local-offer") {
              await pc.setRemoteDescription({ type: "answer", sdp });
            }
            break;
          }

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
  }, [conversationId, currentUserId, wsOn, sendSignal]);

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
    hasAudio,
    hasVideo,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleAudio,
    toggleVideo,
  };
}
