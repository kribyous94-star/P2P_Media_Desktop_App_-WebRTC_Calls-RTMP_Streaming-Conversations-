// Types des signaux WebRTC échangés via WebSocket
export type SignalType =
  | "offer"
  | "answer"
  | "ice-candidate"
  | "call-request"
  | "call-accept"
  | "call-reject"
  | "call-end"
  | "peer-joined"
  | "peer-left"
  | "media-state";

export interface SignalMessage {
  type: SignalType;
  conversationId: string;
  fromPeerId: string;
  toPeerId?: string;        // null = broadcast à tous les peers
  payload: unknown;
}

// État média d'un peer (micro, caméra, screen share)
export interface PeerMediaState {
  peerId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
}

export interface IceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}
