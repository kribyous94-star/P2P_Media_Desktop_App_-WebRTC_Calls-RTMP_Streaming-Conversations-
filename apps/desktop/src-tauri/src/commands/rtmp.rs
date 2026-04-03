// Phase 10 : ce module sera complété avec le pilotage FFmpeg
// Pour l'instant, on expose le contrat des commandes Tauri

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtmpConfig {
    pub server_url: String,
    pub stream_key: String,
    pub video_bitrate: u32,
    pub audio_bitrate: u32,
    pub resolution: String,
    pub fps: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RtmpStatus {
    Idle,
    Connecting,
    Live,
    Error,
    Stopped,
}

#[derive(Debug, Default)]
pub struct RtmpState {
    pub status: RtmpStatus,
    pub config: Option<RtmpConfig>,
    // Phase 10 : handle vers le process FFmpeg
    // process: Option<tokio::process::Child>,
}

impl Default for RtmpStatus {
    fn default() -> Self {
        RtmpStatus::Idle
    }
}

pub type RtmpStateHandle = Mutex<RtmpState>;

/// Démarre la diffusion RTMP via FFmpeg
/// Phase 10 : implémentation complète
#[tauri::command]
pub async fn start_rtmp(
    config: RtmpConfig,
    state: State<'_, RtmpStateHandle>,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;

    if s.status == RtmpStatus::Live {
        return Err("RTMP stream already running".to_string());
    }

    // TODO Phase 10 : spawn FFmpeg process
    s.status = RtmpStatus::Connecting;
    s.config = Some(config);

    Ok(())
}

/// Arrête la diffusion RTMP
#[tauri::command]
pub async fn stop_rtmp(
    state: State<'_, RtmpStateHandle>,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;

    // TODO Phase 10 : kill FFmpeg process
    s.status = RtmpStatus::Stopped;

    Ok(())
}

/// Retourne le statut actuel du flux RTMP
#[tauri::command]
pub async fn get_rtmp_status(
    state: State<'_, RtmpStateHandle>,
) -> Result<RtmpStatus, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.status.clone())
}
