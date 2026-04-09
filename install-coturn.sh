#!/usr/bin/env bash
# =============================================================================
# P2P Media App — Installation / configuration du serveur TURN (coturn)
#
# Comportement :
#   - Si coturn est déjà installé  → utilise la config existante
#   - Si coturn n'est pas installé → l'installe et le configure
#   - Dans les deux cas            → écrit les variables VITE_TURN_* dans
#                                    apps/desktop/.env (sans écraser le reste)
#
# Usage : sudo bash install-coturn.sh [--realm mon-domaine.com]
#         (le realm par défaut est l'IP publique)
#
# Testé sur : Ubuntu 22.04 / 24.04, Debian 12
# =============================================================================
set -euo pipefail

# ── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; >&2; }
log_section() { echo -e "\n${BOLD}${BLUE}━━━  $*  ━━━${NC}\n"; }

# ── Vérifications préliminaires ──────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  log_error "Ce script doit être lancé en root (ou avec sudo)."
  exit 1
fi

# Chemin vers le repo (répertoire du script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_ENV="$SCRIPT_DIR/apps/desktop/.env"

# ── Paramètres CLI ───────────────────────────────────────────────────────────
CUSTOM_REALM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --realm) CUSTOM_REALM="$2"; shift 2 ;;
    *) log_warn "Option inconnue : $1"; shift ;;
  esac
done

# =============================================================================
# 1. Détecter l'IP publique du serveur
# =============================================================================
log_section "Détection de l'IP publique"

PUBLIC_IP=""
for src in \
  "https://api.ipify.org" \
  "https://checkip.amazonaws.com" \
  "https://ifconfig.me/ip"
do
  PUBLIC_IP=$(curl -sf --max-time 5 "$src" 2>/dev/null || true)
  [[ -n "$PUBLIC_IP" ]] && break
done

if [[ -z "$PUBLIC_IP" ]]; then
  # Fallback : première IP non-loopback
  PUBLIC_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1 || true)
fi

if [[ -z "$PUBLIC_IP" ]]; then
  log_warn "Impossible de détecter l'IP publique automatiquement."
  read -rp "Entrez l'IP ou le domaine de ce serveur : " PUBLIC_IP
fi

log_ok "IP publique : $PUBLIC_IP"

REALM="${CUSTOM_REALM:-$PUBLIC_IP}"

# =============================================================================
# 2. Détecter si coturn est déjà installé
# =============================================================================
log_section "Détection de coturn"

COTURN_CONF=""
COTURN_INSTALLED=false

# Cherche le fichier de config dans les emplacements standards
for conf_path in \
  /etc/turnserver.conf \
  /etc/coturn/turnserver.conf
do
  if [[ -f "$conf_path" ]]; then
    COTURN_CONF="$conf_path"
    COTURN_INSTALLED=true
    log_ok "coturn déjà installé — config : $COTURN_CONF"
    break
  fi
done

if ! $COTURN_INSTALLED && command -v turnserver &>/dev/null; then
  # Binaire présent mais pas de config trouvée — on créera la config
  COTURN_INSTALLED=true
  COTURN_CONF="/etc/turnserver.conf"
  log_warn "turnserver trouvé mais pas de fichier de config → sera créé dans $COTURN_CONF"
fi

# =============================================================================
# 3. Installer coturn si absent
# =============================================================================
if ! $COTURN_INSTALLED; then
  log_section "Installation de coturn"
  apt-get update -qq
  apt-get install -y coturn
  COTURN_CONF="/etc/turnserver.conf"
  log_ok "coturn installé"
fi

# =============================================================================
# 4. Lire ou générer les credentials TURN
# =============================================================================
log_section "Configuration des credentials TURN"

TURN_USER=""
TURN_CRED=""
EXISTING_REALM=""

if [[ -f "$COTURN_CONF" ]]; then
  # Lire le premier user=login:password trouvé dans la config
  TURN_USER=$(grep -E '^user=' "$COTURN_CONF" 2>/dev/null | head -1 | sed 's/^user=//' | cut -d: -f1 || true)
  TURN_CRED=$(grep -E '^user=' "$COTURN_CONF" 2>/dev/null | head -1 | sed 's/^user=//' | cut -d: -f2 || true)
  EXISTING_REALM=$(grep -E '^realm=' "$COTURN_CONF" 2>/dev/null | head -1 | sed 's/^realm=//' || true)
fi

# Si aucun user n'existe → en générer un
if [[ -z "$TURN_USER" ]]; then
  TURN_USER="p2p"
  TURN_CRED="$(openssl rand -hex 16)"
  log_info "Aucun credential trouvé → génération d'un nouvel utilisateur TURN"
else
  log_ok "Credential existant trouvé : utilisateur = $TURN_USER"
fi

# Utiliser le realm existant si présent (on ne le modifie pas)
if [[ -n "$EXISTING_REALM" ]]; then
  REALM="$EXISTING_REALM"
  log_ok "Realm existant conservé : $REALM"
fi

# =============================================================================
# 5. Écrire / compléter le fichier de config coturn
# =============================================================================
log_section "Fichier de configuration coturn"

if [[ ! -f "$COTURN_CONF" ]] || ! grep -qE '^user=' "$COTURN_CONF" 2>/dev/null; then
  # Fichier absent ou sans utilisateur → (re)créer les blocs manquants

  if [[ ! -f "$COTURN_CONF" ]]; then
    log_info "Création de $COTURN_CONF"
    cat > "$COTURN_CONF" <<CONF
# coturn — généré par install-coturn.sh
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=$PUBLIC_IP
external-ip=$PUBLIC_IP
realm=$REALM
lt-cred-mech
user=$TURN_USER:$TURN_CRED
log-file=/var/log/turnserver.log
simple-log
no-cli
CONF
    log_ok "$COTURN_CONF créé"
  else
    # Config existante mais sans user → ajouter la ligne user= et lt-cred-mech si absent
    log_info "Ajout du credential dans $COTURN_CONF"

    grep -qE '^lt-cred-mech' "$COTURN_CONF" || echo "lt-cred-mech" >> "$COTURN_CONF"
    echo "user=$TURN_USER:$TURN_CRED" >> "$COTURN_CONF"

    # S'assurer que external-ip et relay-ip sont présents
    grep -qE '^external-ip=' "$COTURN_CONF" || echo "external-ip=$PUBLIC_IP" >> "$COTURN_CONF"
    grep -qE '^relay-ip='    "$COTURN_CONF" || echo "relay-ip=$PUBLIC_IP"    >> "$COTURN_CONF"

    log_ok "Credential ajouté dans la config existante"
  fi
else
  log_ok "Config coturn déjà complète — aucune modification"
fi

# =============================================================================
# 6. Activer le démon coturn (requis sur Debian/Ubuntu)
# =============================================================================
log_section "Activation du service coturn"

COTURN_DEFAULT="/etc/default/coturn"
if [[ -f "$COTURN_DEFAULT" ]]; then
  if ! grep -qE '^TURNSERVER_ENABLED=1' "$COTURN_DEFAULT" 2>/dev/null; then
    sed -i 's/#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' "$COTURN_DEFAULT" 2>/dev/null \
      || echo "TURNSERVER_ENABLED=1" >> "$COTURN_DEFAULT"
    log_ok "TURNSERVER_ENABLED=1 activé dans $COTURN_DEFAULT"
  else
    log_ok "coturn déjà activé dans $COTURN_DEFAULT"
  fi
fi

# Démarrer / redémarrer le service
if systemctl is-active --quiet coturn 2>/dev/null; then
  systemctl reload-or-restart coturn
  log_ok "Service coturn redémarré"
else
  systemctl enable coturn 2>/dev/null || true
  systemctl start  coturn
  log_ok "Service coturn démarré"
fi

# Attendre une seconde pour que le service s'initialise
sleep 1

if systemctl is-active --quiet coturn 2>/dev/null; then
  log_ok "coturn actif et en écoute sur le port 3478 (UDP/TCP)"
else
  log_warn "coturn ne semble pas actif. Vérifiez : journalctl -u coturn -n 50"
fi

# =============================================================================
# 7. Ouvrir les ports dans ufw si actif
# =============================================================================
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  log_section "Pare-feu ufw"
  ufw allow 3478/udp comment "TURN UDP"  &>/dev/null || true
  ufw allow 3478/tcp comment "TURN TCP"  &>/dev/null || true
  ufw allow 5349/tcp comment "TURNS TLS" &>/dev/null || true
  log_ok "Ports 3478 (UDP/TCP) et 5349 (TCP) ouverts dans ufw"
fi

# =============================================================================
# 8. Écrire les variables VITE_ dans apps/desktop/.env
# =============================================================================
log_section "Mise à jour de apps/desktop/.env"

TURN_URL_UDP="turn:$PUBLIC_IP:3478?transport=udp"
TURN_URL_TCP="turn:$PUBLIC_IP:3478?transport=tcp"

update_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ -f "$file" ]] && grep -qE "^${key}=" "$file"; then
    # Met à jour la valeur existante
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    # Ajoute la variable
    echo "${key}=${value}" >> "$file"
  fi
}

# Créer le fichier s'il n'existe pas
touch "$DESKTOP_ENV"

update_env_var "$DESKTOP_ENV" "VITE_TURN_URL"        "$TURN_URL_UDP"
update_env_var "$DESKTOP_ENV" "VITE_TURN_USERNAME"   "$TURN_USER"
update_env_var "$DESKTOP_ENV" "VITE_TURN_CREDENTIAL" "$TURN_CRED"

log_ok ".env mis à jour : $DESKTOP_ENV"

# =============================================================================
# 9. Résumé
# =============================================================================
log_section "Résumé"

echo -e "${BOLD}Serveur TURN configuré :${NC}"
echo -e "  IP publique  : ${GREEN}$PUBLIC_IP${NC}"
echo -e "  Realm        : ${GREEN}$REALM${NC}"
echo -e "  Port         : ${GREEN}3478 (UDP + TCP)${NC}"
echo -e "  Utilisateur  : ${GREEN}$TURN_USER${NC}"
echo -e "  Credential   : ${GREEN}$TURN_CRED${NC}"
echo
echo -e "${BOLD}Variables ajoutées dans apps/desktop/.env :${NC}"
echo -e "  ${YELLOW}VITE_TURN_URL${NC}        = $TURN_URL_UDP"
echo -e "  ${YELLOW}VITE_TURN_USERNAME${NC}   = $TURN_USER"
echo -e "  ${YELLOW}VITE_TURN_CREDENTIAL${NC} = $TURN_CRED"
echo
echo -e "${BOLD}Étapes suivantes :${NC}"
echo -e "  1. Rebuilder l'app desktop : ${BLUE}npm run build -w apps/desktop${NC}"
echo -e "     ou en dev                : ${BLUE}npm run dev -w apps/desktop${NC}"
echo -e "  2. Vérifier coturn         : ${BLUE}systemctl status coturn${NC}"
echo -e "  3. Tester la connectivité  : ${BLUE}https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/${NC}"
echo -e "     → ajouter turn:$PUBLIC_IP:3478 / user=$TURN_USER / cred=$TURN_CRED"
echo
log_ok "Terminé."
