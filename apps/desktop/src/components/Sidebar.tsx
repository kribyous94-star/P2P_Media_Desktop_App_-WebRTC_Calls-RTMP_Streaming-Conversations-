import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConversationStore } from "@/stores/conversation.store.js";
import { useAuthStore } from "@/stores/auth.store.js";
import CreateConversationModal from "./CreateConversationModal.js";
import styles from "./Sidebar.module.css";

const TYPE_ICON: Record<string, string> = {
  private:    "🔒",
  group:      "👥",
  media_room: "🎬",
};

export default function Sidebar() {
  const { conversations, activeId, fetchConversations, setActive, isLoading } = useConversationStore();
  const { user, logout } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  return (
    <aside className={styles.sidebar}>
      {/* Header utilisateur */}
      <div className={styles.userBar}>
        <div className={styles.avatar}>
          {user?.displayName?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className={styles.userInfo}>
          <span className={styles.displayName}>{user?.displayName}</span>
          <span className={styles.username}>@{user?.username}</span>
        </div>
        <button className={styles.logoutBtn} onClick={() => void logout()} title="Déconnexion">
          ⏻
        </button>
      </div>

      {/* Liste des conversations */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>Conversations</span>
          <button className={styles.newBtn} onClick={() => setShowCreate(true)} title="Nouvelle conversation">
            +
          </button>
        </div>

        <div className={styles.list}>
          {isLoading && <p className={styles.muted}>Chargement…</p>}

          {!isLoading && conversations.length === 0 && (
            <p className={styles.muted}>Aucune conversation</p>
          )}

          {conversations.map((conv) => (
            <button
              key={conv.id}
              className={`${styles.convItem} ${activeId === conv.id ? styles.active : ""}`}
              onClick={() => { setActive(conv.id); navigate(`/conversations/${conv.id}`); }}
            >
              <span className={styles.typeIcon}>{TYPE_ICON[conv.type] ?? "💬"}</span>
              <span className={styles.convName}>{conv.name}</span>
              <span className={styles.role}>{conv.userRole}</span>
            </button>
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateConversationModal onClose={() => setShowCreate(false)} />
      )}
    </aside>
  );
}
