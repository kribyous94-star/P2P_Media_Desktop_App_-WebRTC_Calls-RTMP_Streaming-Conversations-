import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store.js";
import { useWsStore } from "@/stores/ws.store.js";
import { useConversationStore } from "@/stores/conversation.store.js";
import { useCallStore } from "@/stores/call.store.js";
import Sidebar from "@/components/Sidebar.js";
import IncomingCallBanner from "@/components/IncomingCallBanner.js";
import ConversationView from "./ConversationView.js";
import styles from "./MainLayout.module.css";

/**
 * Listener global d'appels entrants.
 * Détecte les call:state_update depuis n'importe quelle conversation
 * et stocke la notification dans le call store (affiché par IncomingCallBanner).
 */
function GlobalCallListener() {
  const wsOn        = useWsStore((s) => s.on);
  const currentUser = useAuthStore((s) => s.user);
  const setIncoming = useCallStore((s) => s.setIncoming);

  useEffect(() => {
    if (!currentUser) return;

    return wsOn("call:state_update", (update) => {
      const activeId = useConversationStore.getState().activeId;

      // Ignorer si l'utilisateur est déjà sur cette conversation (CallPanel gère ça)
      if (activeId === update.conversationId) return;

      const { newcomer, callerName } = update;

      if (newcomer && newcomer !== currentUser.id) {
        // Quelqu'un vient de rejoindre une salle d'appel dans une autre conversation
        setIncoming({
          conversationId: update.conversationId,
          fromUserId:     newcomer,
          callerName:     callerName ?? newcomer,
        });
      } else if (update.participants.length === 0) {
        // Plus personne dans l'appel → effacer la notification si elle concerne cette conversation
        const current = useCallStore.getState().incoming;
        if (current?.conversationId === update.conversationId) {
          setIncoming(null);
        }
      }
    });
  }, [wsOn, currentUser, setIncoming]);

  return null;
}

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={styles.layout}>
      <GlobalCallListener />
      <IncomingCallBanner />

      {/* Backdrop mobile */}
      {sidebarOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className={styles.main}>
        {/* Hamburger — visible uniquement sur mobile */}
        <button
          className={styles.hamburger}
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Ouvrir le menu"
        >
          ☰
        </button>

        <Routes>
          <Route index element={<div className={styles.empty}>Sélectionne une conversation</div>} />
          <Route path="conversations/:id" element={<ConversationView />} />
        </Routes>
      </main>
    </div>
  );
}
