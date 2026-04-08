import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store.js";
import { useRtmp } from "@/hooks/useRtmp.js";
import type { RtmpConfig } from "@p2p/shared";
import type { RtmpSource } from "@/hooks/useRtmp.js";
import styles from "./RtmpPanel.module.css";

interface Props {
  conversationId: string;
}

const DEFAULT_CONFIG: RtmpConfig = {
  serverUrl:    "",
  streamKey:    "",
  videoBitrate: 2500,
  audioBitrate: 128,
  resolution:   "720p",
  fps:          30,
};

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function RtmpPanel({ conversationId }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const { status, error, elapsedSeconds, startStream, stopStream } = useRtmp(conversationId);

  const [config, setConfig]   = useState<RtmpConfig>(DEFAULT_CONFIG);
  const [source, setSource]   = useState<RtmpSource>("camera");
  const [expanded, setExpanded] = useState(false);

  // Only the streamer sees the panel — no viewer-side UI needed here
  if (!currentUser) return null;

  const isStreaming = status === "live" || status === "connecting" || status === "acquiring";
  const isIdle      = status === "idle" || status === "stopped" || status === "error";

  const handleStart = () => {
    if (!config.serverUrl.trim() || !config.streamKey.trim()) return;
    void startStream(config, source);
  };

  // ---- Live view ----
  if (isStreaming) {
    return (
      <div className={styles.panel}>
        <div className={styles.liveBar}>
          <span className={`${styles.dot} ${status === "live" ? styles.dotLive : styles.dotConnecting}`} />
          <span className={styles.liveLabel}>
            {status === "live"
              ? `En direct · ${formatElapsed(elapsedSeconds)}`
              : status === "acquiring"
              ? "Accès aux périphériques…"
              : "Connexion au serveur RTMP…"}
          </span>
          <button className={styles.stopBtn} onClick={stopStream} title="Arrêter le stream">
            Arrêter
          </button>
        </div>
      </div>
    );
  }

  // ---- Idle / Error / Config form ----
  return (
    <div className={styles.panel}>
      <button
        className={`${styles.toggleBtn} ${expanded ? styles.toggleBtnActive : ""}`}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Masquer la configuration RTMP" : "Configurer et démarrer un stream RTMP"}
      >
        📡 {expanded ? "Masquer le stream" : "Démarrer un stream RTMP"}
      </button>

      {expanded && isIdle && (
        <div className={styles.form}>
          {error && <p className={styles.errorMsg}>{error}</p>}

          <div className={styles.row}>
            <label className={styles.label}>URL du serveur</label>
            <input
              className={styles.input}
              placeholder="rtmp://live.twitch.tv/app"
              value={config.serverUrl}
              onChange={(e) => setConfig((c) => ({ ...c, serverUrl: e.target.value }))}
            />
          </div>

          <div className={styles.row}>
            <label className={styles.label}>Clé de stream</label>
            <input
              className={styles.input}
              type="password"
              placeholder="xxxx-xxxx-xxxx"
              value={config.streamKey}
              onChange={(e) => setConfig((c) => ({ ...c, streamKey: e.target.value }))}
            />
          </div>

          <div className={styles.rowGroup}>
            <div className={styles.row}>
              <label className={styles.label}>Source</label>
              <select
                className={styles.select}
                value={source}
                onChange={(e) => setSource(e.target.value as RtmpSource)}
              >
                <option value="camera">Caméra + micro</option>
                <option value="screen">Partage d'écran</option>
              </select>
            </div>

            <div className={styles.row}>
              <label className={styles.label}>Résolution</label>
              <select
                className={styles.select}
                value={config.resolution}
                onChange={(e) => setConfig((c) => ({ ...c, resolution: e.target.value as RtmpConfig["resolution"] }))}
              >
                <option value="480p">480p</option>
                <option value="720p">720p (HD)</option>
                <option value="1080p">1080p (Full HD)</option>
              </select>
            </div>

            <div className={styles.row}>
              <label className={styles.label}>FPS</label>
              <select
                className={styles.select}
                value={config.fps}
                onChange={(e) => setConfig((c) => ({ ...c, fps: Number(e.target.value) as 30 | 60 }))}
              >
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>

            <div className={styles.row}>
              <label className={styles.label}>Débit vidéo</label>
              <select
                className={styles.select}
                value={config.videoBitrate}
                onChange={(e) => setConfig((c) => ({ ...c, videoBitrate: Number(e.target.value) }))}
              >
                <option value={1000}>1 000 kbps (faible)</option>
                <option value={2500}>2 500 kbps (moyen)</option>
                <option value={4500}>4 500 kbps (élevé)</option>
                <option value={6000}>6 000 kbps (très élevé)</option>
              </select>
            </div>
          </div>

          <button
            className={styles.startBtn}
            onClick={handleStart}
            disabled={!config.serverUrl.trim() || !config.streamKey.trim()}
          >
            Démarrer le stream
          </button>
        </div>
      )}
    </div>
  );
}
