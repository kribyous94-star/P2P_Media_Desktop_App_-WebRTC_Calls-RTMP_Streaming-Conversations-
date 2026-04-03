# P2P Media Desktop App

Application desktop de communication temps réel avec appels WebRTC, chat persistant et diffusion RTMP.

## Stack

| Couche | Technologie |
|--------|------------|
| Desktop | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript + Zustand |
| Build | Vite 6 |
| Backend | Node.js + Fastify 5 |
| Temps réel | WebSocket (signalisation + chat) |
| Base de données | PostgreSQL |
| Streaming | FFmpeg via commande Tauri |
| Monorepo | Turborepo |

## Structure

```
apps/
  desktop/          # App Tauri + React
  server/           # API REST + WebSocket
packages/
  shared/           # Types TypeScript partagés
```

## Prérequis

### Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Dépendances système (Ubuntu 22.04+)
```bash
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  libssl-dev \
  libgtk-3-dev
```

> Sur Ubuntu < 22.04 : remplacer `libayatana-appindicator3-dev` par `libappindicator3-dev`

### Node.js 20+
```bash
# Via nvm (recommandé)
nvm install 20 && nvm use 20
```

## Installation

```bash
npm install
cp apps/server/.env.example apps/server/.env
# Éditer apps/server/.env avec les vraies valeurs
```

## Développement

```bash
# Serveur backend uniquement
npm run dev:server

# App desktop (dans un second terminal)
cd apps/desktop && npm run tauri:dev

# Les deux en parallèle (si Tauri lance Vite automatiquement)
npm run dev
```

## Phases d'implémentation

| Phase | Contenu | Statut |
|-------|---------|--------|
| 1 | Foundation — monorepo, Tauri, Fastify, types | ✅ |
| 2 | Auth — register/login/session/JWT | ⬜ |
| 3 | Conversations — création, rôles, permissions | ⬜ |
| 4 | Chat texte — messages persistants temps réel | ⬜ |
| 5 | WebRTC 1:1 — offer/answer/ICE | ⬜ |
| 6 | Group calls — multi peers | ⬜ |
| 7 | Screen share — getDisplayMedia | ⬜ |
| 8 | Invitations — par ID ou lien | ⬜ |
| 9 | Permissions avancées — enforcement backend | ⬜ |
| 10 | RTMP — FFmpeg via Tauri | ⬜ |
| 11 | Monitoring — stats flux, état réseau | ⬜ |
| 12 | Polish — UX, edge cases, stabilité | ⬜ |

## Architecture des domaines

Les trois systèmes sont **strictement découplés** :

```
Chat texte    ──►  WebSocket (chat:*)      ──►  DB messages
WebRTC        ──►  WebSocket (webrtc:*)    ──►  Peers (P2P)
RTMP          ──►  Commande Tauri          ──►  FFmpeg → serveur RTMP
```

Le chat texte ne transite **jamais** dans le flux RTMP.
