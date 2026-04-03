import { create } from "zustand";
import { api, ApiError } from "@/lib/api.js";
import { useWsStore } from "./ws.store.js";
import type { Permission } from "@p2p/shared";

export interface ConversationItem {
  id:          string;
  name:        string;
  type:        "private" | "group" | "media_room";
  ownerId:     string;
  userRole:    string;
  permissions: Permission[];
  createdAt:   string;
  updatedAt:   string;
}

interface ConversationState {
  conversations:       ConversationItem[];
  activeId:            string | null;
  isLoading:           boolean;

  fetchConversations:  ()                              => Promise<void>;
  createConversation:  (name: string, type: ConversationItem["type"]) => Promise<ConversationItem>;
  setActive:           (id: string | null)             => void;
  joinRoom:            (id: string)                    => void;
  leaveRoom:           (id: string)                    => void;
  addConversation:     (conv: ConversationItem)        => void;
}

export const useConversationStore = create<ConversationState>()((set, get) => ({
  conversations: [],
  activeId:      null,
  isLoading:     false,

  fetchConversations: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<{ conversations: ConversationItem[] }>("/api/conversations");
      set({ conversations: res.conversations });
    } finally {
      set({ isLoading: false });
    }
  },

  createConversation: async (name, type) => {
    const res = await api.post<{ conversation: ConversationItem }>("/api/conversations", { name, type });
    set((s) => ({ conversations: [res.conversation, ...s.conversations] }));
    return res.conversation;
  },

  setActive: (id) => {
    const prev = get().activeId;
    // Quitter l'ancienne room WS
    if (prev && prev !== id) get().leaveRoom(prev);
    set({ activeId: id });
    // Rejoindre la nouvelle room WS
    if (id) get().joinRoom(id);
  },

  joinRoom: (id) => {
    useWsStore.getState().send("join_conversation", { conversationId: id });
  },

  leaveRoom: (id) => {
    useWsStore.getState().send("leave_conversation", { conversationId: id });
  },

  addConversation: (conv) => {
    set((s) => {
      const exists = s.conversations.some((c) => c.id === conv.id);
      if (exists) return s;
      return { conversations: [conv, ...s.conversations] };
    });
  },
}));

// Re-join the active conversation each time the WS authenticates successfully.
// Fixes the race condition where setActive() fires before the WS is connected
// (page reload, new tab with persisted token).
useWsStore.getState().on("auth:success", () => {
  const { activeId, joinRoom } = useConversationStore.getState();
  if (activeId) joinRoom(activeId);
});
