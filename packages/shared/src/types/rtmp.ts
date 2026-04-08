// RTMP est totalement découplé de WebRTC et du chat texte
export type RtmpStatus = "idle" | "connecting" | "live" | "error" | "stopped";

export interface RtmpConfig {
  serverUrl:    string;                   // ex: rtmp://live.twitch.tv/app
  streamKey:    string;
  videoBitrate: number;                   // kbps
  audioBitrate: number;                   // kbps
  resolution:   "720p" | "1080p" | "480p";
  fps:          30 | 60;
}

export interface RtmpState {
  conversationId: string;
  userId:         string;                 // qui streame
  status:         RtmpStatus;
  config?:        RtmpConfig;
  startedAt?:     string;
  stoppedAt?:     string;
  error?:         string;
}
