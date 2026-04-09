import { useState, useRef, useEffect, useCallback } from "react";
import { useWsStore } from "@/stores/ws.store.js";
import { useCallStore } from "@/stores/call.store.js";
import type { SignalMessage, SignalType } from "@p2p/shared";

export type CallStatus = "idle" | "in-call";

const ICE_SERVERS: RTCIceServer[] = (() => {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl  = import.meta.env["VITE_TURN_URL"]        as string | undefined;
  const turnUser = import.meta.env["VITE_TURN_USERNAME"]   as string | undefined;
  const turnCred = import.meta.env["VITE_TURN_CREDENTIAL"] as string | undefined;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }
  return servers;
})();

interface MediaResult {
  stream:   MediaStream;
  hasAudio: boolean;
  hasVideo: boolean;
}

async function getMediaSafe(): Promise<MediaResult> {
  const stream = new MediaStream();
  let gotAudio = false;
  let gotVideo = false;

  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const t = s.getAudioTracks()[0];
    if (t) { stream.addTrack(t); gotAudio = true; }
  } catch { /* micro refusé */ }

  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    const t = s.getVideoTracks()[0];
    if (t) { stream.addTrack(t); gotVideo = true; }
  } catch { /* caméra refusée */ }

  console.log("[WebRTC] getMediaSafe →", { gotAudio, gotVideo });
  return { stream, hasAudio: gotAudio, hasVideo: gotVideo };
}

export function useWebRTC(
  conversationId: string,
  currentUserId:  string,
  callerName?:    string,
) {
  // ---- État ----
  const [status,        setStatus]       = useState<CallStatus>("idle");
  const [incomingFrom,  setIncomingFrom] = useState<string | null>(null); // appel 1:1 entrant
  const [localStream,   setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [audioEnabled,  setAudioEnabled] = useState(false);
  const [videoEnabled,  setVideoEnabled] = useState(false);
  const [hasAudio,      setHasAudio]     = useState(false);
  const [hasVideo,      setHasVideo]     = useState(false);
  const [callError,     setCallError]    = useState<string | null>(null);
  // Participants actifs dans la salle d'appel (depuis le serveur)
  const [activeParticipants, setActiveParticipants] = useState<string[]>([]);

  // ---- Refs ----
  const pcsRef              = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef      = useRef<MediaStream | null>(null);
  const statusRef           = useRef<CallStatus>("idle");
  const pendingCandidates   = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const wsOn   = useWsStore((s) => s.on);
  const wsSend = useWsStore((s) => s.send);

  // Garder statusRef synchronisé
  useEffect(() => { statusRef.current = status; }, [status]);

  // ---- Helpers ----

  const sendSignal = useCallback((
    type:         SignalType,
    targetUserId: string | null,   // null = diffusion
    payload:      unknown,
  ) => {
    wsSend("webrtc:signal", {
      type,
      conversationId,
      fromPeerId: currentUserId,
      toPeerId:   targetUserId ?? undefined,
      payload,
    } as SignalMessage);
  }, [wsSend, conversationId, currentUserId]);

  const removePeer = useCallback((remoteUserId: string) => {
    pcsRef.current.get(remoteUserId)?.close();
    pcsRef.current.delete(remoteUserId);
    pendingCandidates.current.delete(remoteUserId);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(remoteUserId);
      return next;
    });
  }, []);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    for (const pc of pcsRef.current.values()) pc.close();
    pcsRef.current.clear();
    pendingCandidates.current.clear();

    setStatus("idle");
    setIncomingFrom(null);
    setLocalStream(null);
    setRemoteStreams(new Map());
    setAudioEnabled(false);
    setVideoEnabled(false);
    setHasAudio(false);
    setHasVideo(false);
  }, []);

  const cleanupRef = useRef(cleanup);
  useEffect(() => { cleanupRef.current = cleanup; });

  /** Crée (ou remplace) un RTCPeerConnection pour ce pair distant. */
  const createPC = useCallback((remoteUserId: string): RTCPeerConnection => {
    pcsRef.current.get(remoteUserId)?.close();

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal("ice-candidate", remoteUserId, {
          candidate:     candidate.candidate,
          sdpMid:        candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] ${remoteUserId} connection:`, pc.connectionState);
      // "disconnected" est transitoire — le navigateur peut récupérer tout seul.
      // On ne retire le pair que sur un échec définitif ("failed") ou fermeture ("closed").
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removePeer(remoteUserId);
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] ontrack from ${remoteUserId}:`, event.track.kind);
      setRemoteStreams((prev) => {
        const existing = prev.get(remoteUserId) ?? new MediaStream();
        if (!existing.getTracks().find((t) => t.id === event.track.id)) {
          existing.addTrack(event.track);
        }
        const next = new Map(prev);
        next.set(remoteUserId, new MediaStream(existing.getTracks()));
        return next;
      });
    };

    pcsRef.current.set(remoteUserId, pc);
    return pc;
  }, [sendSignal, removePeer]);

  /** Ajoute les tracks locaux au PC si pas déjà fait. */
  function addLocalTracks(pc: RTCPeerConnection) {
    const stream = localStreamRef.current;
    if (!stream) return;
    const senderTracks = pc.getSenders().map((s) => s.track?.id);
    stream.getTracks().forEach((t) => {
      if (!senderTracks.includes(t.id)) pc.addTrack(t, stream);
    });
    // Ajouter des transceivers recvonly pour les médias manquants
    const hasAudioTrack = stream.getAudioTracks().length > 0;
    const hasVideoTrack = stream.getVideoTracks().length > 0;
    if (!hasAudioTrack) pc.addTransceiver("audio", { direction: "recvonly" });
    if (!hasVideoTrack) pc.addTransceiver("video", { direction: "recvonly" });
  }

  // ---- Acquérir les médias + rejoindre la salle ----
  const joinCall = useCallback(async () => {
    setCallError(null);
    const { stream, hasAudio: gotAudio, hasVideo: gotVideo } = await getMediaSafe();
    localStreamRef.current = stream;
    setLocalStream(gotVideo ? stream : null);
    setHasAudio(gotAudio);
    setHasVideo(gotVideo);
    setAudioEnabled(gotAudio);
    setVideoEnabled(gotVideo);
    setStatus("in-call");
    setIncomingFrom(null);

    // Annoncer sa présence — le serveur diffusera call:state_update à tous les membres
    sendSignal("call-announce", null, { callerName: callerName ?? currentUserId });
  }, [sendSignal, callerName, currentUserId]);

  const startCall = joinCall; // alias pour la 1:1 (l'appelant "démarre" = rejoint)

  const acceptCall = useCallback(() => {
    void joinCall();
  }, [joinCall]);

  const rejectCall = useCallback(() => {
    if (incomingFrom) sendSignal("call-reject", incomingFrom, {});
    setIncomingFrom(null);
  }, [incomingFrom, sendSignal]);

  const hangUp = useCallback(() => {
    // call-leave : diffusé à tous, les pairs retirent ce peer mais restent dans l'appel
    sendSignal("call-leave", null, {});
    cleanupRef.current();
  }, [sendSignal]);

  // ---- Toggles micro/caméra ----
  const toggleAudio = useCallback(async () => {
    if (!hasAudio) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const track = s.getAudioTracks()[0];
        if (!track) return;
        localStreamRef.current?.addTrack(track);
        for (const [peerId, pc] of pcsRef.current.entries()) {
          if (pc.signalingState === "stable") {
            pc.addTrack(track, localStreamRef.current!);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal("call-reoffer", peerId, { sdp: offer.sdp, sdpType: "offer" });
          }
        }
        setHasAudio(true);
        setAudioEnabled(true);
      } catch { /* refusé */ }
      return;
    }
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setAudioEnabled((v) => !v);
  }, [hasAudio, sendSignal]);

  const toggleVideo = useCallback(async () => {
    if (!hasVideo) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        const track = s.getVideoTracks()[0];
        if (!track) return;
        localStreamRef.current?.addTrack(track);
        setLocalStream(new MediaStream(localStreamRef.current!.getTracks()));
        for (const [peerId, pc] of pcsRef.current.entries()) {
          if (pc.signalingState === "stable") {
            pc.addTrack(track, localStreamRef.current!);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal("call-reoffer", peerId, { sdp: offer.sdp, sdpType: "offer" });
          }
        }
        setHasVideo(true);
        setVideoEnabled(true);
      } catch { /* refusé */ }
      return;
    }
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setVideoEnabled((v) => !v);
  }, [hasVideo, sendSignal]);

  // ---- Gestion call:state_update ----
  useEffect(() => {
    return wsOn("call:state_update", (update) => {
      if (update.conversationId !== conversationId) return;
      setActiveParticipants(update.participants);

      const { newcomer, callerName: newCallerName } = update;
      if (!newcomer || newcomer === currentUserId) return;

      // Si je suis dans l'appel et que quelqu'un vient d'arriver → je lui envoie une offre
      if (statusRef.current === "in-call") {
        const pc = createPC(newcomer);
        addLocalTracks(pc);
        void (async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          console.log(`[WebRTC] Sending offer to newcomer ${newcomer}`);
          sendSignal("call-request", newcomer, { sdp: offer.sdp, callerName: callerName ?? currentUserId });
        })();
        return;
      }

      // Sinon : afficher la notification d'appel entrant (conversations privées ou groupes)
      const existing = useCallStore.getState().incoming;
      if (!existing || existing.conversationId !== conversationId) {
        useCallStore.getState().setIncoming({
          conversationId,
          fromUserId: newcomer,
          callerName: newCallerName ?? newcomer,
        });
        setIncomingFrom(newcomer);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsOn, conversationId, currentUserId, createPC, sendSignal, callerName]);

  // ---- Gestion webrtc:signal ----
  useEffect(() => {
    const off = wsOn("webrtc:signal", (signal: SignalMessage) => {
      if (signal.conversationId !== conversationId) return;
      if (signal.toPeerId && signal.toPeerId !== currentUserId) return;

      void (async () => {
        switch (signal.type) {

          // Offre entrante : auto-accepter si déjà dans l'appel, sinon UI entrante
          case "call-request": {
            const { sdp } = signal.payload as { sdp: string };
            console.log(`[WebRTC] call-request from ${signal.fromPeerId}, status=${statusRef.current}`);

            if (statusRef.current === "in-call") {
              // Auto-accepter : on est déjà dans la salle
              const pc = createPC(signal.fromPeerId);
              addLocalTracks(pc);
              await pc.setRemoteDescription({ type: "offer", sdp });
              // Traiter les candidats en attente
              for (const c of pendingCandidates.current.get(signal.fromPeerId) ?? []) {
                await pc.addIceCandidate(c).catch(() => {});
              }
              pendingCandidates.current.delete(signal.fromPeerId);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal("call-accept", signal.fromPeerId, { sdp: answer.sdp });
            } else {
              // Appel entrant 1:1 — afficher l'UI
              setIncomingFrom(signal.fromPeerId);
              useCallStore.getState().setIncoming({
                conversationId,
                fromUserId: signal.fromPeerId,
                callerName: (signal.payload as { callerName?: string }).callerName ?? signal.fromPeerId,
              });
            }
            break;
          }

          case "call-accept": {
            const { sdp } = signal.payload as { sdp: string };
            const pc = pcsRef.current.get(signal.fromPeerId);
            if (!pc) break;
            await pc.setRemoteDescription({ type: "answer", sdp });
            for (const c of pendingCandidates.current.get(signal.fromPeerId) ?? []) {
              await pc.addIceCandidate(c).catch(() => {});
            }
            pendingCandidates.current.delete(signal.fromPeerId);
            break;
          }

          case "call-reject":
            setIncomingFrom(null);
            useCallStore.getState().setIncoming(null);
            if (pcsRef.current.size === 0) cleanupRef.current();
            break;

          case "call-end":
            cleanupRef.current();
            break;

          case "call-leave":
            // Le pair quitte l'appel — on retire son PC, on reste dans l'appel
            removePeer(signal.fromPeerId);
            break;

          case "call-reoffer": {
            const { sdp, sdpType } = signal.payload as { sdp: string; sdpType: "offer" | "answer" };
            const pc = pcsRef.current.get(signal.fromPeerId);
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
            const pc   = pcsRef.current.get(signal.fromPeerId);
            if (pc?.remoteDescription) {
              await pc.addIceCandidate(init).catch(() => {});
            } else {
              const q = pendingCandidates.current.get(signal.fromPeerId) ?? [];
              q.push(init);
              pendingCandidates.current.set(signal.fromPeerId, q);
            }
            break;
          }
        }
      })();
    });

    return off;
  }, [conversationId, currentUserId, wsOn, sendSignal, createPC, removePeer]);

  // Cleanup on unmount / conversation switch
  useEffect(() => {
    return () => { cleanupRef.current(); };
  }, [conversationId]);

  // ---- Valeurs dérivées (compat 1:1) ----
  const firstPeerId   = [...remoteStreams.keys()][0]   ?? null;
  const remoteStream  = firstPeerId ? (remoteStreams.get(firstPeerId) ?? null) : null;

  return {
    status,
    incomingFrom,
    callError,
    localStream,
    remoteStream,        // premier stream distant (1:1 compat)
    remoteStreams,       // Map complète (multi-party)
    activeParticipants,
    audioEnabled,
    videoEnabled,
    hasAudio,
    hasVideo,
    joinCall,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleAudio,
    toggleVideo,
  };
}
