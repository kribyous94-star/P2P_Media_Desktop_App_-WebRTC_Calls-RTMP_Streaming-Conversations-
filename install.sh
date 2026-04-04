#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# P2P Media App — Script d'installation automatique
# Testé sur : Ubuntu 22.04 / 24.04, Debian 12
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_section() { echo -e "\n${BOLD}${BLUE}━━━  $*  ━━━${NC}\n"; }

# =============================================================================
# Vérifications préliminaires
# =============================================================================

check_os() {
  log_section "Vérification du système"

  if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    log_error "Ce script supporte uniquement Linux."
    log_warn  "Pour macOS : https://tauri.app/start/prerequisites/#macos"
    log_warn  "Pour Windows : https://tauri.app/start/prerequisites/#windows"
    exit 1
  fi

  if ! command -v apt &>/dev/null; then
    log_error "apt non trouvé. Ce script requiert une distribution basée sur Debian/Ubuntu."
    exit 1
  fi

  UBUNTU_VERSION=$(. /etc/os-release && echo "$VERSION_ID")
  log_ok "Système détecté : $(. /etc/os-release && echo "$NAME $VERSION_ID")"
}

check_sudo() {
  if [[ "$EUID" -eq 0 ]]; then
    log_warn "Vous exécutez ce script en root. C'est déconseillé."
    log_warn "Les outils comme nvm et Rust doivent être installés en tant qu'utilisateur normal."
    read -rp "Continuer quand même ? [y/N] " confirm
    [[ "${confirm,,}" == "y" ]] || exit 1
  fi

  if ! sudo -n true 2>/dev/null; then
    log_info "Droits sudo requis pour installer les paquets système."
    sudo -v || { log_error "Impossible d'obtenir les droits sudo."; exit 1; }
  fi
}

# =============================================================================
# Dépendances système
# =============================================================================

install_system_deps() {
  log_section "Dépendances système (apt)"

  sudo apt update -qq

  # Paquets communs à toutes les versions
  COMMON_PKGS=(
    build-essential
    curl
    wget
    file
    libssl-dev
    libgtk-3-dev
    libglib2.0-dev
    librsvg2-dev
    patchelf
    libwebkit2gtk-4.1-dev
    pkg-config
    git

    # ---- Audio / Vidéo (Phase 5+ : WebRTC, Phase 7+ : RTMP) ----
    # GStreamer — requis par WebKit pour capturer micro/caméra
    gstreamer1.0-plugins-base
    gstreamer1.0-plugins-good
    gstreamer1.0-plugins-bad
    gstreamer1.0-libav
    gstreamer1.0-gl
    # ALSA + PulseAudio (audio système)
    libasound2-dev
    libpulse-dev
    # Video4Linux (accès caméra)
    libv4l-dev
    v4l-utils
  )

  # Résoudre le conflit libappindicator / libayatana sur Ubuntu 22.04+
  UBUNTU_MAJOR=${UBUNTU_VERSION%%.*}
  if [[ "$UBUNTU_MAJOR" -ge 22 ]]; then
    INDICATOR_PKG="libayatana-appindicator3-dev"
    log_info "Ubuntu $UBUNTU_VERSION : utilisation de libayatana-appindicator3-dev"
  else
    INDICATOR_PKG="libappindicator3-dev"
    log_info "Ubuntu $UBUNTU_VERSION : utilisation de libappindicator3-dev"
  fi

  sudo apt install -y "${COMMON_PKGS[@]}" "$INDICATOR_PKG"
  log_ok "Dépendances système installées."
}

# =============================================================================
# Rust
# =============================================================================

install_rust() {
  log_section "Rust & Cargo"

  # Charger rustup/cargo s'ils sont déjà installés via rustup (pas via apt)
  if [[ -f "$HOME/.cargo/env" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
  fi

  if command -v rustup &>/dev/null; then
    # rustup est présent — mise à jour simple
    log_ok "rustup déjà installé : $(rustup --version 2>&1 | head -1)"
    log_info "Mise à jour vers stable..."
    rustup update stable
    log_ok "Rust : $(rustc --version)"

  elif command -v rustc &>/dev/null; then
    # rustc présent MAIS installé via apt — pas de rustup
    log_warn "Rust détecté via apt ($(rustc --version)), mais rustup est absent."
    log_warn "apt-Rust est limité (pas de gestion de toolchains, version souvent ancienne)."
    log_info "Installation de rustup par-dessus (le toolchain apt restera disponible)..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --no-modify-path
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
    log_ok "rustup installé. Rust actif : $(rustc --version)"

  else
    # Rien du tout — installation from scratch
    log_info "Installation de Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
    log_ok "Rust installé : $(rustc --version)"
  fi
}

# =============================================================================
# Node.js via nvm
# =============================================================================

install_node() {
  log_section "Node.js (via nvm)"

  NODE_REQUIRED="20"

  # Charger nvm si déjà installé
  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -f "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
  fi

  if command -v nvm &>/dev/null; then
    log_ok "nvm déjà installé : $(nvm --version)"
  else
    log_info "Installation de nvm..."
    NVM_LATEST=$(curl -s https://api.github.com/repos/nvm-sh/nvm/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
    curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_LATEST}/install.sh" | bash
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    log_ok "nvm installé : $(nvm --version)"
  fi

  # nvm install est idempotent : si la version est déjà installée, elle est juste activée
  log_info "Installation/activation de Node.js $NODE_REQUIRED..."
  nvm install "$NODE_REQUIRED"
  nvm use "$NODE_REQUIRED"
  nvm alias default "$NODE_REQUIRED"
  log_ok "Node.js actif : $(node --version) | npm : $(npm --version)"
}

# =============================================================================
# Dépendances Node (workspaces)
# =============================================================================

install_node_deps() {
  log_section "Dépendances Node.js (npm workspaces)"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$SCRIPT_DIR"

  if [[ ! -f "package.json" ]]; then
    log_error "package.json introuvable. Lancez ce script depuis la racine du projet."
    exit 1
  fi

  npm install
  log_ok "Dépendances Node installées."

  # Vérification des peer dependencies critiques
  verify_peer_deps
}

# Vérifie que les plugins Fastify sont compatibles avec la version installée
verify_peer_deps() {
  log_section "Vérification des compatibilités"

  local FASTIFY_VERSION
  FASTIFY_VERSION=$(node -e "console.log(require('./node_modules/fastify/package.json').version)" 2>/dev/null || echo "")

  if [[ -z "$FASTIFY_VERSION" ]]; then
    log_warn "Impossible de lire la version de Fastify — vérification ignorée."
    return
  fi

  local FASTIFY_MAJOR
  FASTIFY_MAJOR=$(echo "$FASTIFY_VERSION" | cut -d. -f1)
  log_info "Fastify détecté : v${FASTIFY_VERSION}"

  local ERRORS=0

  # Liste des plugins à vérifier : "paquet|version_majeure_minimale_requise"
  local PLUGINS=(
    "@fastify/cors|10"
    "@fastify/websocket|11"
  )

  for entry in "${PLUGINS[@]}"; do
    local PKG="${entry%%|*}"
    local MIN_MAJOR="${entry##*|}"
    local PKG_PATH="node_modules/${PKG}/package.json"

    if [[ ! -f "$PKG_PATH" ]]; then
      log_warn "${PKG} non trouvé dans node_modules — ignoré."
      continue
    fi

    local PKG_VERSION
    PKG_VERSION=$(node -e "console.log(require('./${PKG_PATH}').version)" 2>/dev/null || echo "")
    local PKG_MAJOR
    PKG_MAJOR=$(echo "$PKG_VERSION" | cut -d. -f1)

    if [[ "$PKG_MAJOR" -lt "$MIN_MAJOR" ]]; then
      log_error "${PKG}@${PKG_VERSION} est incompatible avec Fastify ${FASTIFY_MAJOR} (requis : v${MIN_MAJOR}+)"
      ERRORS=$((ERRORS + 1))
    else
      log_ok "${PKG}@${PKG_VERSION} compatible avec Fastify ${FASTIFY_MAJOR}."
    fi
  done

  if [[ "$ERRORS" -gt 0 ]]; then
    log_error "$ERRORS incompatibilité(s) détectée(s). Le serveur ne démarrera pas."
    log_error "Vérifiez apps/server/package.json et relancez ./install.sh"
    exit 1
  fi
}

# =============================================================================
# Configuration de l'environnement serveur (interactive)
# =============================================================================

configure_env() {
  log_section "Configuration de l'environnement"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local ENV_FILE="$SCRIPT_DIR/apps/server/.env"

  # ---- Valeurs courantes (pour les re-runs) ----
  local CUR_DB_HOST="localhost" CUR_DB_PORT="5432" CUR_DB_NAME="p2p_media"
  local CUR_DB_USER="p2p"      CUR_DB_PASS=""      CUR_JWT_SECRET=""

  if [[ -f "$ENV_FILE" ]]; then
    local EXISTING_URL
    EXISTING_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
    if [[ -n "$EXISTING_URL" ]]; then
      CUR_DB_USER=$(echo "$EXISTING_URL" | sed 's|postgresql://\([^:]*\):.*|\1|')
      CUR_DB_PASS=$(echo "$EXISTING_URL" | sed 's|postgresql://[^:]*:\([^@]*\)@.*|\1|')
      CUR_DB_HOST=$(echo "$EXISTING_URL" | sed 's|.*@\([^:/]*\)[:/].*|\1|')
      CUR_DB_PORT=$(echo "$EXISTING_URL" | sed 's|.*:\([0-9]*\)/.*|\1|')
      CUR_DB_NAME=$(echo "$EXISTING_URL" | sed 's|.*/\([^?]*\).*|\1|')
    fi
    CUR_JWT_SECRET=$(grep "^JWT_SECRET=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
  fi

  # ---- Prompts interactifs ----
  echo -e "${BOLD}  Configuration PostgreSQL${NC}  (Entrée = valeur par défaut)"
  echo ""

  local DB_HOST DB_PORT DB_NAME DB_USER DB_PASS JWT_SECRET
  read -rp "  Hôte          [${CUR_DB_HOST}] : " DB_HOST;  DB_HOST="${DB_HOST:-$CUR_DB_HOST}"
  read -rp "  Port          [${CUR_DB_PORT}] : " DB_PORT;  DB_PORT="${DB_PORT:-$CUR_DB_PORT}"
  read -rp "  Base de données [${CUR_DB_NAME}] : " DB_NAME; DB_NAME="${DB_NAME:-$CUR_DB_NAME}"
  read -rp "  Utilisateur   [${CUR_DB_USER}] : " DB_USER;  DB_USER="${DB_USER:-$CUR_DB_USER}"

  # Mot de passe — obligatoire, jamais vide
  while true; do
    if [[ -n "$CUR_DB_PASS" ]]; then
      read -rsp "  Mot de passe  [Entrée = conserver l'actuel] : " DB_PASS; echo ""
      [[ -z "$DB_PASS" ]] && DB_PASS="$CUR_DB_PASS"
    else
      read -rsp "  Mot de passe  (requis) : " DB_PASS; echo ""
    fi
    [[ -n "$DB_PASS" ]] && break
    log_warn "Le mot de passe ne peut pas être vide."
  done

  # JWT_SECRET — auto-généré si absent ou placeholder
  local IS_PLACEHOLDER=false
  [[ "$CUR_JWT_SECRET" == "super-secret-jwt-key-change-in-production" || -z "$CUR_JWT_SECRET" ]] \
    && IS_PLACEHOLDER=true

  local DEFAULT_JWT
  if $IS_PLACEHOLDER; then
    DEFAULT_JWT=$(openssl rand -hex 32 2>/dev/null \
      || python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null \
      || tr -dc 'a-f0-9' </dev/urandom | head -c 64)
  else
    DEFAULT_JWT="$CUR_JWT_SECRET"
  fi

  echo ""
  echo -e "  ${BOLD}JWT Secret${NC}"
  if $IS_PLACEHOLDER; then
    echo -e "  ${BLUE}[auto-généré]${NC} ${DEFAULT_JWT}"
    read -rp "  Remplacer ? [Entrée = garder celui-ci] : " JWT_SECRET
  else
    read -rp "  JWT_SECRET [Entrée = conserver l'actuel] : " JWT_SECRET
  fi
  JWT_SECRET="${JWT_SECRET:-$DEFAULT_JWT}"

  # ---- Écriture du .env ----
  local DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

  cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=7d

DATABASE_URL=${DATABASE_URL}

ALLOWED_ORIGINS=http://localhost:1420
ENVEOF

  log_ok ".env configuré : ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

  # Exporter pour install_postgres
  export _DB_USER="$DB_USER"
  export _DB_PASS="$DB_PASS"
  export _DB_HOST="$DB_HOST"
  export _DB_PORT="$DB_PORT"
  export _DB_NAME="$DB_NAME"
}

# =============================================================================
# Tauri CLI + Icônes
# =============================================================================

install_tauri_cli() {
  log_section "Tauri CLI"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$SCRIPT_DIR"

  if npx -y @tauri-apps/cli@^2 --version &>/dev/null 2>&1; then
    log_ok "Tauri CLI disponible via npx."
  else
    log_warn "Tauri CLI sera disponible via : cd apps/desktop && npx tauri"
  fi
}

generate_tauri_icons() {
  log_section "Icônes Tauri"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ICONS_DIR="$SCRIPT_DIR/apps/desktop/src-tauri/icons"

  # Si toutes les icônes nécessaires existent déjà, on passe
  if [[ -f "$ICONS_DIR/32x32.png" && -f "$ICONS_DIR/128x128.png" && -f "$ICONS_DIR/icon.ico" ]]; then
    log_ok "Icônes Tauri déjà présentes."
    return
  fi

  mkdir -p "$ICONS_DIR"

  # Générer une image source 1024x1024 avec Python3 (toujours disponible sur Ubuntu)
  log_info "Génération de l'image source (1024x1024)..."
  local SRC_PNG="$ICONS_DIR/_source.png"

  python3 - "$SRC_PNG" <<'PYEOF'
import struct, zlib, sys

def make_png(w, h, r=108, g=99, b=255):
    def chunk(tag, data):
        buf = tag + data
        return struct.pack('>I', len(data)) + buf + struct.pack('>I', zlib.crc32(buf) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    raw = b''.join(b'\x00' + bytes([r, g, b]) * w for _ in range(h))
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

with open(sys.argv[1], 'wb') as f:
    f.write(make_png(1024, 1024))
PYEOF

  log_info "Génération de toutes les icônes via Tauri CLI..."
  cd "$SCRIPT_DIR/apps/desktop"
  npx --yes @tauri-apps/cli@^2 icon "$SRC_PNG" --output "$ICONS_DIR" 2>&1 | grep -v "^$" || true
  cd "$SCRIPT_DIR"

  # Nettoyage de l'image source temporaire
  rm -f "$SRC_PNG"

  if [[ -f "$ICONS_DIR/32x32.png" ]]; then
    log_ok "Icônes Tauri générées dans src-tauri/icons/"
  else
    log_warn "Génération des icônes incomplète — le build Tauri pourrait échouer."
    log_warn "Relancez : cd apps/desktop && npx tauri icon <votre-logo.png>"
  fi
}

# =============================================================================
# PostgreSQL
# =============================================================================

install_postgres() {
  log_section "PostgreSQL"

  if command -v psql &>/dev/null; then
    log_ok "PostgreSQL déjà installé : $(psql --version)"
  else
    log_info "Installation de PostgreSQL..."
    sudo apt install -y postgresql postgresql-client
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
    log_ok "PostgreSQL installé."
  fi

  # S'assurer que PostgreSQL est démarré
  sudo systemctl start postgresql 2>/dev/null || true

  # Récupérer les variables exportées par configure_env
  local DB_USER="${_DB_USER:-p2p}"
  local DB_PASS="${_DB_PASS:-}"
  local DB_HOST="${_DB_HOST:-localhost}"
  local DB_NAME="${_DB_NAME:-p2p_media}"

  log_info "Configuration de la base '${DB_NAME}' (user: ${DB_USER})..."

  # Créer le rôle PostgreSQL s'il n'existe pas (en tant que postgres)
  sudo -u postgres psql -tc \
    "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null \
    | grep -q 1 || sudo -u postgres psql -c \
    "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null \
    && log_ok "Rôle '${DB_USER}' présent." || true

  # Mettre à jour le mot de passe si le rôle existait déjà
  sudo -u postgres psql -c \
    "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true

  # Créer la base si elle n'existe pas
  sudo -u postgres psql -tc \
    "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null \
    | grep -q 1 || sudo -u postgres psql -c \
    "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || true

  # Accorder tous les privilèges
  sudo -u postgres psql -c \
    "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true

  # Vérifier la connexion avec les credentials configurés
  if ! PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$DB_NAME" \
      -c "SELECT 1;" &>/dev/null; then
    log_error "Impossible de se connecter à PostgreSQL avec ${DB_USER}@${DB_HOST}/${DB_NAME}"
    log_error "Vérifiez pg_hba.conf ou relancez ./install.sh"
    exit 1
  fi

  # Appliquer les migrations SQL du dossier drizzle/
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local MIGRATIONS_DIR="$SCRIPT_DIR/apps/server/drizzle"
  if [[ -d "$MIGRATIONS_DIR" ]]; then
    for sql_file in "$MIGRATIONS_DIR"/*.sql; do
      [[ -f "$sql_file" ]] || continue
      log_info "Migration : $(basename "$sql_file")..."
      PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$DB_NAME" \
        -f "$sql_file" -q 2>/dev/null \
        && log_ok "$(basename "$sql_file") appliqué." \
        || log_warn "$(basename "$sql_file") déjà appliqué ou erreur ignorée."
    done
  fi

  log_ok "Base de données prête."
}

# =============================================================================
# Récapitulatif final
# =============================================================================

print_summary() {
  log_section "Installation terminée"

  echo -e "${GREEN}${BOLD}Tout est prêt !${NC}"
  echo ""

  echo -e "  ${BOLD}Phases implémentées :${NC}"
  echo -e "    ✅ Phase 1  — Monorepo, Tauri scaffold, Fastify, WebSocket, Zustand"
  echo -e "    ✅ Phase 2  — Auth (register/login/logout, JWT, argon2id)"
  echo -e "    ✅ Phase 3  — Conversations (CRUD, rôles, permissions, rooms WS)"
  echo -e "    ✅ Phase 4  — Chat texte (messages persistants, pagination, temps réel)"
  echo -e "    ✅ Phase 5  — WebRTC 1:1 (signaling, audio/vidéo, appels entrants globaux)"
  echo -e "    ✅ Phase 6  — Gestion membres (liste, rôles, kick, invitation par username)"
  echo ""

  echo -e "  ${BOLD}Mode développement (navigateur — le plus rapide pour tester) :${NC}"
  echo -e "    ${YELLOW}# Terminal 1 — backend${NC}"
  echo -e "    npm run dev:server"
  echo ""
  echo -e "    ${YELLOW}# Terminal 2 — frontend React (http://localhost:1420)${NC}"
  echo -e "    npm run dev:desktop"
  echo ""

  echo -e "  ${BOLD}Mode Tauri (app desktop native) :${NC}"
  echo -e "    ${YELLOW}# Terminal 1 — backend${NC}"
  echo -e "    npm run dev:server"
  echo ""
  echo -e "    ${YELLOW}# Terminal 2 — Tauri + Vite${NC}"
  echo -e "    cd apps/desktop && npm run tauri:dev"
  echo ""

  echo -e "  ${BOLD}Build production — étapes complètes :${NC}"
  echo ""
  echo -e "    ${YELLOW}# 1. Compiler server (TypeScript → dist/) + frontend (Vite → dist/)${NC}"
  echo -e "    npm run build"
  echo ""
  echo -e "    ${YELLOW}# 2a. Lancer le serveur compilé — mode simple${NC}"
  echo -e "    npm run start --workspace=apps/server"
  echo -e "    ${BLUE}    → démarre apps/server/dist/index.js (Node.js, port 3001)${NC}"
  echo ""
  echo -e "    ${YELLOW}# 2b. Prévisualiser le frontend web compilé (optionnel)${NC}"
  echo -e "    npm run preview --workspace=apps/desktop"
  echo -e "    ${BLUE}    → sert apps/desktop/dist/ sur http://localhost:4173${NC}"
  echo ""
  echo -e "    ${YELLOW}# 2c. Générer l'installateur natif Tauri (.deb / AppImage)${NC}"
  echo -e "    cd apps/desktop && npm run tauri:build"
  echo -e "    ${BLUE}    → bundle généré dans apps/desktop/src-tauri/target/release/bundle/${NC}"
  echo ""

  # ---- PM2 ----
  echo -e "  ${BOLD}Mode PM2 (gestionnaire de processus — recommandé en production) :${NC}"
  echo ""
  if command -v pm2 &>/dev/null; then
    echo -e "    ${GREEN}PM2 détecté :${NC} $(pm2 --version)"
  else
    echo -e "    ${YELLOW}# Installer PM2 globalement (une seule fois)${NC}"
    echo -e "    npm install -g pm2"
    echo ""
  fi
  echo -e "    ${YELLOW}# Démarrer le serveur via l'ecosystem (après npm run build)${NC}"
  echo -e "    pm2 start ecosystem.config.cjs"
  echo ""
  echo -e "    ${YELLOW}# Commandes courantes${NC}"
  echo -e "    pm2 status                    ${BLUE}# état des processus${NC}"
  echo -e "    pm2 logs p2p-server           ${BLUE}# logs en direct${NC}"
  echo -e "    pm2 restart p2p-server        ${BLUE}# redémarrer sans coupure${NC}"
  echo -e "    pm2 stop p2p-server           ${BLUE}# arrêter${NC}"
  echo ""
  echo -e "    ${YELLOW}# Persistance au reboot (à faire une fois)${NC}"
  echo -e "    pm2 save && pm2 startup"
  echo -e "    ${BLUE}    → exécutez ensuite la commande sudo affichée par pm2 startup${NC}"
  echo ""

  # ---- Nginx ----
  echo -e "  ${BOLD}Mise en ligne avec Nginx (déploiement serveur) :${NC}"
  echo ""
  echo -e "    ${YELLOW}# 1. Installer nginx et certbot${NC}"
  echo -e "    sudo apt install -y nginx certbot python3-certbot-nginx"
  echo ""
  echo -e "    ${YELLOW}# 2a. Domaine dédié (toute la plateforme sur votre-domaine.com)${NC}"
  echo -e "    sudo cp nginx/dedicated.conf /etc/nginx/sites-available/p2pmedia"
  echo -e "    ${BLUE}    → Remplacer 'votre-domaine.com' et '/chemin/vers/le/projet' dans le fichier${NC}"
  echo ""
  echo -e "    ${YELLOW}# 2b. Sous-domaine (media.votre-domaine.com sur serveur partagé)${NC}"
  echo -e "    sudo cp nginx/subdomain.conf /etc/nginx/sites-available/p2pmedia"
  echo -e "    ${BLUE}    → Remplacer 'media.votre-domaine.com' et '/chemin/vers/le/projet' dans le fichier${NC}"
  echo ""
  echo -e "    ${YELLOW}# 3. Activer et obtenir le certificat SSL${NC}"
  echo -e "    sudo ln -s /etc/nginx/sites-available/p2pmedia /etc/nginx/sites-enabled/"
  echo -e "    sudo nginx -t && sudo systemctl reload nginx"
  echo -e "    sudo certbot --nginx -d votre-domaine.com   ${BLUE}# ou media.votre-domaine.com${NC}"
  echo ""
  echo -e "    ${YELLOW}# 4. Variables d'environnement à mettre à jour pour la production${NC}"
  echo -e "    ${BLUE}    apps/server/.env :${NC}"
  echo -e "    ALLOWED_ORIGINS=https://votre-domaine.com"
  echo -e "    ${BLUE}    apps/desktop/.env (avant npm run build) :${NC}"
  echo -e "    VITE_API_URL=https://votre-domaine.com"
  echo -e "    VITE_WS_URL=wss://votre-domaine.com/ws"
  echo ""

  echo -e "  ${BOLD}Notes :${NC}"
  echo -e "    • Si Rust vient d'être installé, rechargez votre shell :"
  echo -e "      ${YELLOW}source ~/.cargo/env${NC}"
  echo -e "    • WebRTC (micro/caméra) requiert HTTPS ou localhost."
  echo -e "      En mode navigateur, ouvrez ${YELLOW}http://localhost:1420${NC}"
  echo -e "    • Vérifiez que votre micro/caméra est branché avant de tester les appels."
  echo ""
}

# =============================================================================
# Point d'entrée
# =============================================================================

main() {
  echo -e "${BOLD}${BLUE}"
  echo "  ██████╗ ██████╗ ██████╗     ███╗   ███╗███████╗██████╗ ██╗ █████╗ "
  echo "  ██╔══██╗╚════██╗██╔══██╗    ████╗ ████║██╔════╝██╔══██╗██║██╔══██╗"
  echo "  ██████╔╝ █████╔╝██████╔╝    ██╔████╔██║█████╗  ██║  ██║██║███████║"
  echo "  ██╔═══╝ ██╔═══╝ ██╔═══╝     ██║╚██╔╝██║██╔══╝  ██║  ██║██║██╔══██║"
  echo "  ██║     ███████╗██║         ██║ ╚═╝ ██║███████╗██████╔╝██║██║  ██║"
  echo "  ╚═╝     ╚══════╝╚═╝         ╚═╝     ╚═╝╚══════╝╚═════╝ ╚═╝╚═╝  ╚═╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}P2P Media Desktop App — Installateur${NC}"
  echo ""

  check_os
  check_sudo
  install_system_deps
  install_rust
  install_node
  install_node_deps
  configure_env
  install_postgres
  install_tauri_cli
  generate_tauri_icons
  print_summary
}

main "$@"
