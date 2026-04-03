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
# Configuration de l'environnement serveur
# =============================================================================

setup_env() {
  log_section "Configuration de l'environnement"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV_FILE="$SCRIPT_DIR/apps/server/.env"
  ENV_EXAMPLE="$SCRIPT_DIR/apps/server/.env.example"

  cp "$ENV_EXAMPLE" "$ENV_FILE"
  log_ok ".env (re)créé depuis .env.example"
  log_warn "Pensez à éditer apps/server/.env (JWT_SECRET, DATABASE_URL)"
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

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local ENV_FILE="$SCRIPT_DIR/apps/server/.env"

  # Lire les infos de connexion depuis le .env existant
  if [[ -f "$ENV_FILE" ]]; then
    local DB_URL
    DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
    local DB_USER DB_PASS DB_NAME
    DB_USER=$(echo "$DB_URL" | sed 's|postgresql://\([^:]*\):.*|\1|')
    DB_PASS=$(echo "$DB_URL" | sed 's|postgresql://[^:]*:\([^@]*\)@.*|\1|')
    DB_NAME=$(echo "$DB_URL" | sed 's|.*/\([^?]*\).*|\1|')
  else
    # Valeurs par défaut si pas encore de .env
    DB_USER="postgres"; DB_PASS=""; DB_NAME="p2p_media"
  fi

  log_info "Configuration de la base '${DB_NAME}' (user: ${DB_USER})..."

  # Créer la base si elle n'existe pas
  PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h localhost \
    -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null \
    | grep -q 1 || PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h localhost \
    -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || true

  # Appliquer les migrations SQL du dossier drizzle/
  local MIGRATIONS_DIR="$SCRIPT_DIR/apps/server/drizzle"
  if [[ -d "$MIGRATIONS_DIR" ]]; then
    for sql_file in "$MIGRATIONS_DIR"/*.sql; do
      [[ -f "$sql_file" ]] || continue
      log_info "Migration : $(basename "$sql_file")..."
      PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h localhost -d "$DB_NAME" \
        -f "$sql_file" -q 2>/dev/null && log_ok "$(basename "$sql_file") appliqué." \
        || log_warn "$(basename "$sql_file") déjà appliqué ou erreur (ignoré)."
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
  echo -e "  ${BOLD}Lancer le serveur backend :${NC}"
  echo -e "    npm run dev:server"
  echo ""
  echo -e "  ${BOLD}Lancer l'app desktop Tauri :${NC}"
  echo -e "    cd apps/desktop && npm run tauri:dev"
  echo ""
  echo -e "  ${BOLD}Note importante :${NC}"
  echo -e "    Si Rust vient d'être installé, rechargez votre shell :"
  echo -e "    ${YELLOW}source ~/.cargo/env${NC}"
  echo ""
  echo -e "  ${BOLD}Avant de lancer le backend, éditer :${NC}"
  echo -e "    ${YELLOW}apps/server/.env${NC}  (JWT_SECRET, DATABASE_URL)"
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
  setup_env
  install_postgres
  install_tauri_cli
  generate_tauri_icons
  print_summary
}

main "$@"
