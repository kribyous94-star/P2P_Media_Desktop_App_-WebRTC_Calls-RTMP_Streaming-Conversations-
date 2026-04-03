import { useEffect, useRef, useState, useCallback } from "react";
import { useMessageStore } from "@/stores/message.store.js";
import { useWsStore } from "@/stores/ws.store.js";
import { useAuthStore } from "@/stores/auth.store.js";
import { api } from "@/lib/api.js";
import type { Message } from "@p2p/shared";
import styles from "./ChatPanel.module.css";

interface Props {
  conversationId: string;
}

export default function ChatPanel({ conversationId }: Props) {
  const { byConversation, hasMore, isLoading, fetchMessages, appendMessage } = useMessageStore();
  const wsOn   = useWsStore((s) => s.on);
  const user   = useAuthStore((s) => s.user);
  const messages = byConversation[conversationId] ?? [];
  const loading  = isLoading[conversationId] ?? false;
  const more     = hasMore[conversationId] ?? false;

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  // Initial load
  useEffect(() => {
    isInitialLoad.current = true;
    void fetchMessages(conversationId);
  }, [conversationId, fetchMessages]);

  // Subscribe to real-time messages
  useEffect(() => {
    const off = wsOn("chat:message", (msg: Message) => {
      if (msg.conversationId === conversationId) {
        appendMessage(msg);
      }
    });
    return off;
  }, [conversationId, wsOn, appendMessage]);

  // Scroll to bottom on new messages (only on initial load or when user is near bottom)
  useEffect(() => {
    if (isInitialLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      isInitialLoad.current = false;
    } else {
      const list = listRef.current;
      if (!list) return;
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      if (nearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages.length]);

  const loadMore = useCallback(() => {
    const oldest = messages[0];
    if (oldest) void fetchMessages(conversationId, oldest.createdAt);
  }, [conversationId, fetchMessages, messages]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      const res = await api.post<{ message: Message }>(
        `/api/conversations/${conversationId}/messages`,
        { content }
      );
      appendMessage(res.message);
    } catch {
      setInput(content); // restore on error
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.list} ref={listRef}>
        {more && (
          <button className={styles.loadMore} onClick={loadMore} disabled={loading}>
            {loading ? "Chargement…" : "Charger les messages précédents"}
          </button>
        )}

        {messages.map((msg, i) => {
          const isOwn  = msg.authorId === user?.id;
          const prev   = messages[i - 1];
          const showAuthor = !prev || prev.authorId !== msg.authorId;

          return (
            <div key={msg.id} className={`${styles.msgGroup} ${isOwn ? styles.own : ""}`}>
              {showAuthor && !isOwn && (
                <span className={styles.author}>{msg.authorUsername}</span>
              )}
              <div className={styles.bubble}>
                <span className={styles.text}>{msg.content}</span>
                <span className={styles.time}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}

        {messages.length === 0 && !loading && (
          <p className={styles.empty}>Aucun message. Soyez le premier à écrire !</p>
        )}

        <div ref={bottomRef} />
      </div>

      <div className={styles.inputBar}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écrire un message… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"
          rows={1}
          disabled={sending}
        />
        <button
          className={styles.sendBtn}
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
          aria-label="Envoyer"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
