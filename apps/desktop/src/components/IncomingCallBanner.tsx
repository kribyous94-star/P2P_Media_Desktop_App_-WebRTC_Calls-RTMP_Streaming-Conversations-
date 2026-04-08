import { useNavigate } from "react-router-dom";
import { useCallStore } from "@/stores/call.store.js";
import { useConversationStore } from "@/stores/conversation.store.js";
import styles from "./IncomingCallBanner.module.css";

/**
 * Bannière flottante d'appel entrant.
 * Visible quand un pair rejoint une salle d'appel dans une conversation
 * que l'utilisateur n'est pas en train de regarder.
 */
export default function IncomingCallBanner() {
  const incoming      = useCallStore((s) => s.incoming);
  const setIncoming   = useCallStore((s) => s.setIncoming);
  const activeId      = useConversationStore((s) => s.activeId);
  const conversations = useConversationStore((s) => s.conversations);
  const navigate      = useNavigate();

  const convName = conversations.find((c) => c.id === incoming?.conversationId)?.name ?? "une conversation";

  if (!incoming || activeId === incoming.conversationId) return null;

  const accept = () => {
    navigate(`/conversations/${incoming.conversationId}`);
    setIncoming(null);
    // Le CallPanel se monte et voit activeParticipants > 0 → bouton "Rejoindre"
  };

  const dismiss = () => {
    setIncoming(null);
  };

  return (
    <div className={styles.banner}>
      <div className={styles.info}>
        <span className={styles.icon}>📞</span>
        <div>
          <p className={styles.title}>Appel en cours</p>
          <p className={styles.sub}>{incoming.callerName} · {convName}</p>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.dismissBtn} onClick={dismiss} title="Ignorer">✕</button>
        <button className={styles.acceptBtn}  onClick={accept}  title="Rejoindre">Rejoindre</button>
      </div>
    </div>
  );
}
