import { useNavigate } from "react-router-dom";
import { useCallStore } from "@/stores/call.store.js";
import { useConversationStore } from "@/stores/conversation.store.js";
import { useWsStore } from "@/stores/ws.store.js";
import styles from "./IncomingCallBanner.module.css";

/**
 * Bannière flottante d'appel entrant.
 * Visible dès qu'une offre WebRTC est reçue alors que l'utilisateur
 * n'est pas sur la conversation concernée.
 */
export default function IncomingCallBanner() {
  const incoming      = useCallStore((s) => s.incoming);
  const setIncoming   = useCallStore((s) => s.setIncoming);
  const activeId      = useConversationStore((s) => s.activeId);
  const conversations = useConversationStore((s) => s.conversations);
  const wsSend        = useWsStore((s) => s.send);
  const navigate      = useNavigate();

  const convName = conversations.find((c) => c.id === incoming?.conversationId)?.name ?? "une conversation";

  // Masquer si pas d'appel entrant ou si l'utilisateur est déjà sur la conversation
  if (!incoming || activeId === incoming.conversationId) return null;

  const accept = () => {
    // Naviguer → CallPanel se monte → useWebRTC lit le store et affiche l'overlay
    navigate(`/conversations/${incoming.conversationId}`);
    // Ne pas clear le store ici : useWebRTC le fera au montage
  };

  const reject = () => {
    wsSend("webrtc:signal", {
      type:           "call-reject",
      conversationId: incoming.conversationId,
      fromPeerId:     "",   // sera écrasé côté serveur par l'userId authentifié
      toPeerId:       incoming.fromUserId,
      payload:        {},
    });
    setIncoming(null);
  };

  return (
    <div className={styles.banner}>
      <div className={styles.info}>
        <span className={styles.icon}>📞</span>
        <div>
          <p className={styles.title}>Appel entrant</p>
          <p className={styles.sub}>{incoming.callerName} · {convName}</p>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.rejectBtn} onClick={reject} title="Refuser">✕</button>
        <button className={styles.acceptBtn} onClick={accept} title="Accepter">✓</button>
      </div>
    </div>
  );
}
