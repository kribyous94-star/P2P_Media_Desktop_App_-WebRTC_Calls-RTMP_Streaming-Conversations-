import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useConversationStore } from "@/stores/conversation.store.js";
import { useAuthStore } from "@/stores/auth.store.js";
import { api, ApiError } from "@/lib/api.js";
import ChatPanel from "@/components/ChatPanel.js";
import CallPanel from "@/components/CallPanel.js";
import MembersPanel from "@/components/MembersPanel.js";
import RtmpPanel from "@/components/RtmpPanel.js";
import styles from "./ConversationView.module.css";

function AddMemberPopover({ conversationId }: { conversationId: string }) {
  const [open, setOpen]     = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setUsername(""); setError(null); inputRef.current?.focus(); }
  }, [open]);

  const submit = async () => {
    if (!username.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/conversations/${conversationId}/members`, { username: username.trim() });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.addMemberWrapper}>
      <button
        className={styles.addMemberBtn}
        onClick={() => setOpen((v) => !v)}
        title="Ajouter un membre"
      >
        👤+
      </button>

      {open && (
        <div className={styles.addMemberPopover}>
          <p className={styles.popoverLabel}>Ajouter par nom d'utilisateur</p>
          <div className={styles.popoverRow}>
            <input
              ref={inputRef}
              className={styles.popoverInput}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="username"
            />
            <button className={styles.popoverBtn} onClick={() => void submit()} disabled={loading}>
              {loading ? "…" : "Ajouter"}
            </button>
          </div>
          {error && <p className={styles.popoverError}>{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const { conversations, activeId, setActive } = useConversationStore();
  const currentUser = useAuthStore((s) => s.user);
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    if (id && id !== activeId) setActive(id);
  }, [id, activeId, setActive]);

  // Close members panel when switching conversations
  useEffect(() => { setShowMembers(false); }, [id]);

  const conv = conversations.find((c) => c.id === id);

  if (!conv) {
    return <div className={styles.empty}>Conversation introuvable</div>;
  }

  const canInvite = conv.userRole === "owner" || conv.userRole === "moderator";

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <span className={styles.typeIcon}>
          {{ private: "🔒", group: "👥", media_room: "🎬" }[conv.type] ?? "💬"}
        </span>
        <span className={styles.name}>{conv.name}</span>
        <span className={styles.role}>{conv.userRole}</span>
        {canInvite && <AddMemberPopover conversationId={conv.id} />}
        <button
          className={`${styles.membersBtn} ${showMembers ? styles.membersBtnActive : ""}`}
          onClick={() => setShowMembers((v) => !v)}
          title="Membres"
        >
          👥
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.main}>
          {/* Phase 5 : WebRTC — appels 1:1 (private + media_room) */}
          {(conv.type === "private" || conv.type === "media_room") && (
            <div className={styles.callWrapper}>
              <CallPanel conversationId={conv.id} conversationName={conv.name} />
            </div>
          )}

          {/* Phase 4 : Chat texte */}
          <ChatPanel conversationId={conv.id} />

          {/* Phase 7 : RTMP — streaming vers Twitch, YouTube, etc. */}
          {conv.type === "media_room" && (
            <RtmpPanel conversationId={conv.id} />
          )}
        </div>

        {/* Phase 6 : Panneau membres */}
        {showMembers && currentUser && (
          <MembersPanel
            conversationId={conv.id}
            currentUserId={currentUser.id}
            currentRole={conv.userRole}
            onClose={() => setShowMembers(false)}
          />
        )}
      </div>
    </div>
  );
}
