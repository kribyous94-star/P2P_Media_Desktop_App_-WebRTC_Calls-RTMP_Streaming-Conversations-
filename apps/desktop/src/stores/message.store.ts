import { create } from "zustand";
import { api } from "@/lib/api.js";
import type { Message } from "@p2p/shared";

interface MessageState {
  // conversationId → ordered messages (oldest first)
  byConversation: Record<string, Message[]>;
  hasMore:        Record<string, boolean>;
  isLoading:      Record<string, boolean>;

  fetchMessages:  (conversationId: string, before?: string) => Promise<void>;
  appendMessage:  (message: Message) => void;
  clearConversation: (conversationId: string) => void;
}

export const useMessageStore = create<MessageState>()((set, get) => ({
  byConversation: {},
  hasMore:        {},
  isLoading:      {},

  fetchMessages: async (conversationId, before) => {
    set((s) => ({ isLoading: { ...s.isLoading, [conversationId]: true } }));
    try {
      const url = before
        ? `/api/conversations/${conversationId}/messages?before=${encodeURIComponent(before)}`
        : `/api/conversations/${conversationId}/messages`;

      const res = await api.get<{ messages: Message[]; hasMore: boolean }>(url);

      set((s) => {
        const existing = s.byConversation[conversationId] ?? [];
        // Prepend older messages (before= means loading older)
        const merged = before
          ? [...res.messages, ...existing]
          : res.messages;
        return {
          byConversation: { ...s.byConversation, [conversationId]: merged },
          hasMore:        { ...s.hasMore,        [conversationId]: res.hasMore },
        };
      });
    } finally {
      set((s) => ({ isLoading: { ...s.isLoading, [conversationId]: false } }));
    }
  },

  appendMessage: (message) => {
    set((s) => {
      const existing = s.byConversation[message.conversationId] ?? [];
      // Avoid duplicates (REST POST + WS broadcast both arrive)
      if (existing.some((m) => m.id === message.id)) return s;
      return {
        byConversation: {
          ...s.byConversation,
          [message.conversationId]: [...existing, message],
        },
      };
    });
  },

  clearConversation: (conversationId) => {
    set((s) => ({
      byConversation: { ...s.byConversation, [conversationId]: [] },
      hasMore:        { ...s.hasMore,        [conversationId]: false },
    }));
  },
}));
