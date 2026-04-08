import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConversationStore } from "@/stores/conversation.store.js";
import { useAuthStore } from "@/stores/auth.store.js";
import { useWsStore } from "@/stores/ws.store.js";
import CreateConversationModal from "./CreateConversationModal.js";
import styles from "./Sidebar.module.css";

const TYPE_ICON: Record<string, string> = {
  private:    "🔒",
  group:      "👥",
  media_room: "🎬",
};

interface Props {
  mobileOpen?:    boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: Props) {
  const { conversations, activeId, fetchConversations, setActive, isLoading } = useConversationStore();
  const { user, logout } = useAuthStore();
  const wsOn = useWsStore((s) => s.on);
  const [showCreate, setShowCreate] = useState(false);
  // Map conversationId → nombre de participants dans l'appel
  const [activeCalls, setActiveCalls] = useState<Map<string, number>>(new Map());
  const navigate = useNavigate();

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  // Écouter les mises à jour d'état d'appel pour afficher les badges
  useEffect(() => {
    return wsOn("call:state_update", (update) => {
      setActiveCalls((prev) => {
        const next = new Map(prev);
        if (update.participants.length === 0) {
          next.delete(update.conversationId);
        } else {
          next.set(update.conversationId, update.participants.length);
        }
        return next;
      });
    });
  }, [wsOn]);

  function selectConversation(id: string) {
    setActive(id);
    navigate(`/conversations/${id}`);
    onMobileClose?.();
  }

  return (
    <aside className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ""}`}>
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

          {conversations.map((conv) => {
            const callCount = activeCalls.get(conv.id) ?? 0;
            return (
              <button
                key={conv.id}
                className={`${styles.convItem} ${activeId === conv.id ? styles.active : ""}`}
                onClick={() => selectConversation(conv.id)}
              >
                <span className={styles.typeIcon}>{TYPE_ICON[conv.type] ?? "💬"}</span>
                <span className={styles.convName}>{conv.name}</span>
                {callCount > 0 && (
                  <span className={styles.callBadge} title={`${callCount} participant${callCount > 1 ? "s" : ""} dans l'appel`}>
                    🔴
                  </span>
                )}
                <span className={styles.role}>{conv.userRole}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showCreate && (
        <CreateConversationModal onClose={() => setShowCreate(false)} />
      )}
    </aside>
  );
}
