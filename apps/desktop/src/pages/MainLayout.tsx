import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store.js";
import { useWsStore } from "@/stores/ws.store.js";
import { useConversationStore } from "@/stores/conversation.store.js";
import { useCallStore } from "@/stores/call.store.js";
import type { SignalMessage } from "@p2p/shared";
import Sidebar from "@/components/Sidebar.js";
import IncomingCallBanner from "@/components/IncomingCallBanner.js";
import ConversationView from "./ConversationView.js";
import styles from "./MainLayout.module.css";

/**
 * Listener global d'appels WebRTC entrants.
 * Actif tant que l'utilisateur est authentifié, quelle que soit la vue ouverte.
 */
function GlobalCallListener() {
  const wsOn        = useWsStore((s) => s.on);
  const currentUser = useAuthStore((s) => s.user);
  const setIncoming = useCallStore((s) => s.setIncoming);

  useEffect(() => {
    if (!currentUser) return;

    return wsOn("webrtc:signal", (signal: SignalMessage) => {
      // Ignorer les signaux destinés à quelqu'un d'autre
      if (signal.toPeerId && signal.toPeerId !== currentUser.id) return;

      if (signal.type === "call-request") {
        const activeId = useConversationStore.getState().activeId;

        // Si l'utilisateur est déjà sur la conversation, CallPanel/useWebRTC gère tout
        if (activeId === signal.conversationId) return;

        const { sdp, callerName } = signal.payload as { sdp: string; callerName?: string };

        setIncoming({
          conversationId: signal.conversationId,
          fromUserId:     signal.fromPeerId,
          callerName:     callerName ?? signal.fromPeerId,
          sdp,
        });
      }

      if (signal.type === "call-end" || signal.type === "call-reject") {
        const current = useCallStore.getState().incoming;
        if (current?.conversationId === signal.conversationId) {
          setIncoming(null);
        }
      }
    });
  }, [wsOn, currentUser, setIncoming]);

  return null;
}

export default function MainLayout() {
  return (
    <div className={styles.layout}>
      <GlobalCallListener />
      <IncomingCallBanner />
      <Sidebar />
      <main className={styles.main}>
        <Routes>
          <Route index element={<div className={styles.empty}>Sélectionne une conversation</div>} />
          <Route path="conversations/:id" element={<ConversationView />} />
        </Routes>
      </main>
    </div>
  );
}
