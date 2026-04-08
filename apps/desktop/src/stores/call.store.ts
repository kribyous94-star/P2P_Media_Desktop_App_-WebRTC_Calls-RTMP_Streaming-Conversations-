import { create } from "zustand";

export interface IncomingCallInfo {
  conversationId: string;
  fromUserId:     string;
  callerName:     string;
}

interface CallState {
  incoming:    IncomingCallInfo | null;
  setIncoming: (call: IncomingCallInfo | null) => void;
}

export const useCallStore = create<CallState>()((set) => ({
  incoming:    null,
  setIncoming: (call) => set({ incoming: call }),
}));
