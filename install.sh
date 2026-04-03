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
}

# =============================================================================
# Configuration de l'environnement serveur
# =============================================================================

setup_env() {
  log_section "Configuration de l'environnement"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV_FILE="$SCRIPT_DIR/apps/server/.env"
  ENV_EXAMPLE="$SCRIPT_DIR/apps/server/.env.example"

  if [[ -f "$ENV_FILE" ]]; then
    log_warn ".env déjà présent — non écrasé."
  else
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    log_ok ".env créé depuis .env.example"
    log_warn "Pensez à éditer apps/server/.env (JWT_SECRET, DATABASE_URL)"
  fi
}

# =============================================================================
# Tauri CLI
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
  install_tauri_cli
  print_summary
}

main "$@"
