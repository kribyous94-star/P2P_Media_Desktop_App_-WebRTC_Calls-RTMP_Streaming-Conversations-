import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface IncomingCallInfo {
  conversationId: string;
  fromUserId:     string;
  callerName:     string;  // displayName ou username de l'appelant
  sdp:            string;
}

interface CallState {
  incoming:    IncomingCallInfo | null;
  setIncoming: (call: IncomingCallInfo | null) => void;
}

export const useCallStore = create<CallState>()(
  persist(
    (set) => ({
      incoming:    null,
      setIncoming: (call) => set({ incoming: call }),
    }),
    {
      name: "p2p-incoming-call",
      // Ne persister que l'invitation, pas les actions
      partialize: (state) => ({ incoming: state.incoming }),
    }
  )
);
