import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api.js";
import { useAuthStore } from "@/stores/auth.store.js";
import { useWsStore } from "@/stores/ws.store.js";
import { useWebRTC } from "@/hooks/useWebRTC.js";
import styles from "./CallPanel.module.css";

interface Member {
  userId:      string;
  username:    string;
  displayName: string;
  role:        string;
}

interface Props {
  conversationId:   string;
  conversationName: string;
}

export default function CallPanel({ conversationId, conversationName }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const wsOn        = useWsStore((s) => s.on);
  const [members, setMembers] = useState<Member[]>([]);

  const {
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
  } = useWebRTC(conversationId, currentUser?.id ?? "", currentUser?.displayName ?? currentUser?.username);

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const fetchMembers = useCallback(() => {
    api.get<{ members: Member[] }>(`/api/conversations/${conversationId}/members`)
      .then((res) => setMembers(res.members))
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  useEffect(() => {
    return wsOn("conversation:member_joined", (payload) => {
      if (payload.conversationId === conversationId) fetchMembers();
    });
  }, [wsOn, conversationId, fetchMembers]);

  // status dans les deps : ontrack peut se déclencher AVANT que le status passe à
  // "in-call" (donc avant que l'élément <video> existe dans le DOM). Sans status,
  // le useEffect ne se relance pas au moment où la vidéo est montée, et srcObject
  // n'est jamais assigné → écran noir, pas de son côté callee.
  useEffect(() => {
    const video = localVideoRef.current;
    if (video && localStream) {
      video.srcObject = localStream;
      void video.play().catch(() => {});
    }
  }, [localStream, status]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (video && remoteStream) {
      video.srcObject = remoteStream;
      void video.play().catch(() => {});
    }
  }, [remoteStream, status]);

  const otherMember  = members.find((m) => m.userId !== currentUser?.id);
  const remoteMember = members.find((m) => m.userId === remoteUserId);

  // ---- Incoming call overlay ----
  if (status === "incoming") {
    return (
      <div className={styles.incomingOverlay}>
        <div className={styles.incomingBox}>
          <p className={styles.incomingTitle}>Appel entrant</p>
          <p className={styles.incomingFrom}>
            {remoteMember?.displayName ?? remoteMember?.username ?? remoteUserId}
          </p>
          <div className={styles.incomingActions}>
            <button className={styles.rejectBtn} onClick={rejectCall} title="Refuser">✕</button>
            <button className={styles.acceptBtn} onClick={() => void acceptCall()} title="Accepter">✓</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Calling / In-call ----
  if (status === "calling" || status === "in-call") {
    const audioTitle = !hasAudio
      ? "Cliquer pour demander l'accès au micro"
      : audioEnabled ? "Couper le micro" : "Activer le micro";

    const videoTitle = !hasVideo
      ? "Cliquer pour demander l'accès à la caméra"
      : videoEnabled ? "Couper la caméra" : "Activer la caméra";

    return (
      <div className={styles.callView}>
        {/* Remote video */}
        <div className={styles.remoteWrapper}>
          {remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className={styles.remoteVideo} />
          ) : (
            <div className={styles.waitingOverlay}>
              <span className={styles.waitingIcon}>📞</span>
              <p>{status === "calling" ? "Appel en cours…" : "Connexion…"}</p>
            </div>
          )}
        </div>

        {/* Local video (picture-in-picture) — uniquement si caméra disponible */}
        {hasVideo && localStream && (
          <video ref={localVideoRef} autoPlay playsInline muted className={styles.localVideo} />
        )}

        {/* Indicateurs médias désactivés */}
        <div className={styles.mediaIndicators}>
          {!hasAudio && (
            <span className={styles.indicatorBadge} title="Micro indisponible">🎙️✕</span>
          )}
          {!hasVideo && (
            <span className={styles.indicatorBadge} title="Caméra indisponible">📷✕</span>
          )}
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <button
            className={`${styles.ctrlBtn} ${
              !hasAudio ? styles.ctrlNoDevice : !audioEnabled ? styles.ctrlOff : ""
            }`}
            onClick={() => void toggleAudio()}
            title={audioTitle}
          >
            {hasAudio ? (audioEnabled ? "🎙️" : "🔇") : "🎙️"}
          </button>
          <button
            className={`${styles.ctrlBtn} ${
              !hasVideo ? styles.ctrlNoDevice : !videoEnabled ? styles.ctrlOff : ""
            }`}
            onClick={() => void toggleVideo()}
            title={videoTitle}
          >
            {hasVideo ? (videoEnabled ? "📷" : "📵") : "📷"}
          </button>
          <button className={`${styles.ctrlBtn} ${styles.hangUpBtn}`} onClick={hangUp} title="Raccrocher">
            📵 Raccrocher
          </button>
        </div>
      </div>
    );
  }

  // ---- Idle — barre d'appel ----
  if (!otherMember) return null;

  return (
    <div className={styles.idleBar}>
      <button
        className={styles.callBtn}
        onClick={() => void startCall(otherMember.userId)}
        title={`Appeler dans ${conversationName}`}
      >
        📞 Démarrer un appel
      </button>
      {callError && <span className={styles.callError}>{callError}</span>}
    </div>
  );
}
