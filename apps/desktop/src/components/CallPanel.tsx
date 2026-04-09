import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth.store.js";
import { useWsStore } from "@/stores/ws.store.js";
import { useWebRTC } from "@/hooks/useWebRTC.js";
import styles from "./CallPanel.module.css";

interface Props {
  conversationId:   string;
  conversationName: string;
  onStatusChange?:  (inCall: boolean) => void;
}

/** Composant de rendu d'un flux vidéo distant. */
function PeerVideo({
  stream,
  status,
}: {
  stream: MediaStream;
  status: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
  }, [stream, status]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className={styles.remoteVideo}
    />
  );
}

export default function CallPanel({ conversationId, conversationName, onStatusChange }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const wsOn        = useWsStore((s) => s.on);

  const {
    status,
    incomingFrom,
    callError,
    localStream,
    remoteStreams,
    activeParticipants,
    audioEnabled,
    videoEnabled,
    hasAudio,
    hasVideo,
    joinCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleAudio,
    toggleVideo,
  } = useWebRTC(conversationId, currentUser?.id ?? "", currentUser?.displayName ?? currentUser?.username);

  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Sync local video srcObject
  useEffect(() => {
    const video = localVideoRef.current;
    if (video && localStream) {
      video.srcObject = localStream;
      void video.play().catch(() => {});
    }
  }, [localStream, status]);

  // Notifier le parent du changement d'état (active le mode TikTok dans ConversationView)
  useEffect(() => {
    onStatusChange?.(status === "in-call");
  }, [status, onStatusChange]);

  // Nettoyer l'indicateur global d'appel entrant quand on monte sur la bonne conversation
  useEffect(() => {
    return wsOn("webrtc:signal" as never, () => {});
  }, [wsOn]);

  const audioTitle = !hasAudio
    ? "Cliquer pour demander l'accès au micro"
    : audioEnabled ? "Couper le micro" : "Activer le micro";

  const videoTitle = !hasVideo
    ? "Cliquer pour demander l'accès à la caméra"
    : videoEnabled ? "Couper la caméra" : "Activer la caméra";

  // ---- Appel entrant (notification 1:1) ----
  if (status === "idle" && incomingFrom) {
    return (
      <div className={styles.incomingOverlay}>
        <div className={styles.incomingBox}>
          <p className={styles.incomingTitle}>Appel entrant</p>
          <p className={styles.incomingFrom}>{incomingFrom}</p>
          <div className={styles.incomingActions}>
            <button className={styles.rejectBtn} onClick={rejectCall} title="Refuser">✕</button>
            <button className={styles.acceptBtn} onClick={acceptCall} title="Accepter">✓</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Appel actif ----
  if (status === "in-call") {
    const remoteEntries = [...remoteStreams.entries()];
    const alone         = remoteEntries.length === 0;

    return (
      <div className={`${styles.callView} ${styles.callViewFull}`}>
        {/* Grille vidéos distantes */}
        <div className={`${styles.remoteGrid} ${alone ? styles.remoteGridAlone : ""}`}>
          {alone ? (
            <div className={styles.waitingOverlay}>
              <span className={styles.waitingIcon}>📞</span>
              <p>En attente de participants…</p>
            </div>
          ) : (
            remoteEntries.map(([userId, stream]) => (
              <PeerVideo key={userId} stream={stream} status={status} />
            ))
          )}
        </div>

        {/* Vidéo locale PiP */}
        {hasVideo && localStream && (
          <video ref={localVideoRef} autoPlay playsInline muted className={`${styles.localVideo} ${styles.localVideoFull}`} />
        )}

        {/* Indicateurs médias indisponibles */}
        <div className={styles.mediaIndicators}>
          {!hasAudio && <span className={styles.indicatorBadge} title="Micro indisponible">🎙️✕</span>}
          {!hasVideo && <span className={styles.indicatorBadge} title="Caméra indisponible">📷✕</span>}
        </div>

        {/* Contrôles — colonne verticale à droite sur mobile (style TikTok) */}
        <div className={`${styles.controls} ${styles.controlsFull}`}>
          <button
            className={`${styles.ctrlBtn} ${styles.ctrlBtnFull} ${!hasAudio ? styles.ctrlNoDevice : !audioEnabled ? styles.ctrlOff : ""}`}
            onClick={() => void toggleAudio()}
            title={audioTitle}
          >
            {hasAudio ? (audioEnabled ? "🎙️" : "🔇") : "🎙️"}
          </button>
          <button
            className={`${styles.ctrlBtn} ${styles.ctrlBtnFull} ${!hasVideo ? styles.ctrlNoDevice : !videoEnabled ? styles.ctrlOff : ""}`}
            onClick={() => void toggleVideo()}
            title={videoTitle}
          >
            {hasVideo ? (videoEnabled ? "📷" : "📵") : "📷"}
          </button>
          <button
            className={`${styles.ctrlBtn} ${styles.ctrlBtnFull} ${styles.hangUpBtn}`}
            onClick={hangUp}
            title="Raccrocher"
          >
            📵
          </button>
        </div>
      </div>
    );
  }

  // ---- Idle — barre d'appel ----
  const othersInCall = activeParticipants.filter((id) => id !== currentUser?.id);
  const callActive   = othersInCall.length > 0;

  return (
    <div className={styles.idleBar}>
      {callActive ? (
        <>
          <span className={styles.callActiveBadge}>
            🔴 {othersInCall.length} participant{othersInCall.length > 1 ? "s" : ""} dans l'appel
          </span>
          <button
            className={styles.joinBtn}
            onClick={() => void joinCall()}
            title={`Rejoindre l'appel dans ${conversationName}`}
          >
            Rejoindre
          </button>
        </>
      ) : (
        <button
          className={styles.callBtn}
          onClick={() => void joinCall()}
          title={`Démarrer un appel dans ${conversationName}`}
        >
          📞 Démarrer un appel
        </button>
      )}
      {callError && <span className={styles.callError}>{callError}</span>}
    </div>
  );
}
