import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useConversationStore } from "@/stores/conversation.store.js";
import styles from "./ConversationView.module.css";

export default function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const { conversations, activeId, setActive } = useConversationStore();

  // Sync URL param → store activeId
  useEffect(() => {
    if (id && id !== activeId) setActive(id);
  }, [id, activeId, setActive]);

  const conv = conversations.find((c) => c.id === id);

  if (!conv) {
    return (
      <div className={styles.empty}>Conversation introuvable</div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <span className={styles.typeIcon}>
          {{ private: "🔒", group: "👥", media_room: "🎬" }[conv.type] ?? "💬"}
        </span>
        <span className={styles.name}>{conv.name}</span>
        <span className={styles.role}>{conv.userRole}</span>
      </div>

      {/* Phase 4 : Chat */}
      {/* Phase 5 : WebRTC */}
      {/* Phase 7 : RTMP */}
      <div className={styles.placeholder}>
        <p>Conversation <strong>{conv.name}</strong></p>
        <p className={styles.hint}>Phase 4 — Chat à venir</p>
      </div>
    </div>
  );
}
