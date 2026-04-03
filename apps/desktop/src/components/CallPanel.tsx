import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api.js";
import { useAuthStore } from "@/stores/auth.store.js";
import { useWebRTC } from "@/hooks/useWebRTC.js";
import styles from "./CallPanel.module.css";

interface Member {
  userId:      string;
  username:    string;
  displayName: string;
  role:        string;
}

interface Props {
  conversationId: string;
}

export default function CallPanel({ conversationId }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<Member[]>([]);

  const {
    status,
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
  } = useWebRTC(conversationId, currentUser?.id ?? "");

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Fetch members to know who to call
  useEffect(() => {
    api.get<{ members: Member[] }>(`/api/conversations/${conversationId}/members`)
      .then((res) => setMembers(res.members))
      .catch(() => {});
  }, [conversationId]);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const otherMember = members.find((m) => m.userId !== currentUser?.id);
  const remoteMember = members.find((m) => m.userId === remoteUserId);

  // ---- Idle — show call button ----
  if (status === "idle") {
    if (!otherMember) return null;
    return (
      <div className={styles.idleBar}>
        <button
          className={styles.callBtn}
          onClick={() => void startCall(otherMember.userId)}
          title={`Appeler ${otherMember.displayName}`}
        >
          📞 Appeler {otherMember.displayName}
        </button>
      </div>
    );
  }

  // ---- Incoming call ----
  if (status === "incoming") {
    return (
      <div className={styles.incomingOverlay}>
        <div className={styles.incomingBox}>
          <p className={styles.incomingTitle}>Appel entrant</p>
          <p className={styles.incomingFrom}>
            {remoteMember?.displayName ?? remoteMember?.username ?? remoteUserId}
          </p>
          <div className={styles.incomingActions}>
            <button className={styles.rejectBtn} onClick={rejectCall}>✕ Refuser</button>
            <button className={styles.acceptBtn} onClick={() => void acceptCall()}>✓ Accepter</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Calling / In-call ----
  return (
    <div className={styles.callView}>
      {/* Remote video */}
      <div className={styles.remoteWrapper}>
        {remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className={styles.remoteVideo} />
        ) : (
          <div className={styles.waitingOverlay}>
            <span className={styles.waitingIcon}>📞</span>
            <p>{status === "calling" ? `Appel de ${otherMember?.displayName ?? "…"}` : "Connexion…"}</p>
          </div>
        )}
      </div>

      {/* Local video (picture-in-picture) */}
      {localStream && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={styles.localVideo}
        />
      )}

      {/* Controls */}
      <div className={styles.controls}>
        <button
          className={`${styles.ctrlBtn} ${!audioEnabled ? styles.ctrlOff : ""}`}
          onClick={toggleAudio}
          title={audioEnabled ? "Couper le micro" : "Activer le micro"}
        >
          {audioEnabled ? "🎙️" : "🔇"}
        </button>
        <button
          className={`${styles.ctrlBtn} ${!videoEnabled ? styles.ctrlOff : ""}`}
          onClick={toggleVideo}
          title={videoEnabled ? "Couper la caméra" : "Activer la caméra"}
        >
          {videoEnabled ? "📷" : "📵"}
        </button>
        <button className={`${styles.ctrlBtn} ${styles.hangUpBtn}`} onClick={hangUp} title="Raccrocher">
          📵 Raccrocher
        </button>
      </div>
    </div>
  );
}
