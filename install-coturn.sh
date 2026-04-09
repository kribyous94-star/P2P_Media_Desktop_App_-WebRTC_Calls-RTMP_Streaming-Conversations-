#!/usr/bin/env bash
# =============================================================================
# P2P Media App — Configuration du serveur TURN (coturn)
#
# Flux :
#   1. Scanne le serveur pour trouver les domaines / configurations existants
#   2. Présente un menu interactif
#   3. Installe / reconfigure coturn si nécessaire
#   4. Écrit les variables VITE_TURN_* dans apps/desktop/.env
#
# Usage : sudo bash install-coturn.sh
#
# Testé sur : Ubuntu 22.04 / 24.04, Debian 12
# =============================================================================
set -euo pipefail

# ── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

log_info()    { echo -e "  ${BLUE}•${NC} $*"; }
log_ok()      { echo -e "  ${GREEN}✓${NC} $*"; }
log_warn()    { echo -e "  ${YELLOW}!${NC} $*"; }
log_error()   { echo -e "  ${RED}✗${NC} $*" >&2; }
log_section() { echo -e "\n${BOLD}${BLUE}━━━  $*  ━━━${NC}"; }
log_dim()     { echo -e "  ${DIM}$*${NC}"; }

# ── Vérifications préliminaires ───────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  log_error "Ce script doit être lancé en root (sudo bash install-coturn.sh)."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_ENV="$SCRIPT_DIR/apps/desktop/.env"

# =============================================================================
# Phase 1 — Scan du serveur
# =============================================================================
log_section "Analyse du serveur"
echo

# ── Détecter l'IP publique ────────────────────────────────────────────────────
PUBLIC_IP=""
for src in "https://api.ipify.org" "https://checkip.amazonaws.com" "https://ifconfig.me/ip"; do
  PUBLIC_IP=$(curl -sf --max-time 5 "$src" 2>/dev/null || true)
  [[ -n "$PUBLIC_IP" ]] && break
done
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP=$(ip route get 1.1.1.1 2>/dev/null \
    | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1 || true)
fi
log_info "IP publique détectée : ${CYAN}${PUBLIC_IP:-inconnue}${NC}"

# ── Chercher les fichiers de config coturn ────────────────────────────────────
COTURN_CONF=""
for f in /etc/turnserver.conf /etc/coturn/turnserver.conf; do
  [[ -f "$f" ]] && { COTURN_CONF="$f"; break; }
done

COTURN_INSTALLED=false
command -v turnserver &>/dev/null && COTURN_INSTALLED=true
[[ -n "$COTURN_CONF"  ]] && COTURN_INSTALLED=true

if $COTURN_INSTALLED; then
  log_ok "coturn installé${COTURN_CONF:+ — config : $COTURN_CONF}"
else
  log_info "coturn non installé"
fi

# ── Lire realm / user depuis la config existante ──────────────────────────────
EXISTING_REALM=""; EXISTING_USER=""; EXISTING_CRED=""
if [[ -n "$COTURN_CONF" && -f "$COTURN_CONF" ]]; then
  EXISTING_REALM=$(grep -E '^realm=' "$COTURN_CONF" 2>/dev/null | head -1 | sed 's/^realm=//' || true)
  EXISTING_USER=$(grep  -E '^user='  "$COTURN_CONF" 2>/dev/null | head -1 | sed 's/^user=//' | cut -d: -f1 || true)
  EXISTING_CRED=$(grep  -E '^user='  "$COTURN_CONF" 2>/dev/null | head -1 | sed 's/^user=//' | cut -d: -f2 || true)
fi

# ── Collecter les noms de domaine disponibles (sources multiples) ─────────────
# Un tableau associatif : domaine → source
declare -A DOMAIN_SOURCES

# Source 1 : realm coturn
if [[ -n "$EXISTING_REALM" ]] && echo "$EXISTING_REALM" | grep -qE '[a-zA-Z]'; then
  DOMAIN_SOURCES["$EXISTING_REALM"]="coturn realm existant"
fi

# Source 2 : certificats Let's Encrypt
if [[ -d /etc/letsencrypt/live ]]; then
  while IFS= read -r -d '' cert_dir; do
    domain=$(basename "$cert_dir")
    [[ "$domain" == "README" ]] && continue
    DOMAIN_SOURCES["$domain"]="certificat Let's Encrypt"
  done < <(find /etc/letsencrypt/live -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
fi

# Source 3 : server_name dans les configs nginx actives
for nginx_conf_dir in /etc/nginx/sites-enabled /etc/nginx/conf.d; do
  [[ -d "$nginx_conf_dir" ]] || continue
  while IFS= read -r line; do
    # Extraire les valeurs de server_name (un ou plusieurs domaines par directive)
    domains=$(echo "$line" | grep -oE '[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}' || true)
    while IFS= read -r d; do
      [[ -z "$d" || "$d" == *"votre-domaine"* || "$d" == *"example"* ]] && continue
      # Ignorer les IPs
      echo "$d" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' && continue
      DOMAIN_SOURCES["$d"]="nginx (${nginx_conf_dir})"
    done <<< "$domains"
  done < <(grep -rh 'server_name' "$nginx_conf_dir" 2>/dev/null | grep -v '#')
done

# Source 4 : VITE_TURN_URL déjà présente dans .env
if [[ -f "$DESKTOP_ENV" ]]; then
  existing_turn_url=$(grep -E '^VITE_TURN_URL=' "$DESKTOP_ENV" 2>/dev/null | sed 's/^VITE_TURN_URL=//' || true)
  if [[ -n "$existing_turn_url" ]]; then
    # Extraire le host depuis turn:HOST:PORT?...
    existing_turn_host=$(echo "$existing_turn_url" | sed 's|^turns\?://||;s|^turn:||;s|:.*||')
    if echo "$existing_turn_host" | grep -qE '[a-zA-Z]'; then
      DOMAIN_SOURCES["$existing_turn_host"]=".env VITE_TURN_URL actuel"
    fi
    log_info "VITE_TURN_URL déjà configuré : ${CYAN}$existing_turn_url${NC}"
  fi
fi

# Dédupliquer et construire la liste ordonnée
# Priorité : realm coturn > letsencrypt > nginx > .env
mapfile -t DOMAINS < <(
  # realm d'abord
  [[ -n "$EXISTING_REALM" ]] && echo "$EXISTING_REALM"
  for d in "${!DOMAIN_SOURCES[@]}"; do
    [[ "$d" == "$EXISTING_REALM" ]] && continue
    echo "$d"
  done
)

# Afficher ce qui a été trouvé
if [[ "${#DOMAIN_SOURCES[@]}" -gt 0 ]]; then
  log_ok "${#DOMAIN_SOURCES[@]} nom(s) de domaine détecté(s) :"
  for d in "${DOMAINS[@]}"; do
    log_dim "   $d  (${DOMAIN_SOURCES[$d]})"
  done
else
  log_info "Aucun nom de domaine trouvé — l'IP sera utilisée par défaut."
fi

# =============================================================================
# Phase 2 — Menu interactif
# =============================================================================
log_section "Que souhaitez-vous faire ?"
echo

IDX=1
declare -a MENU_LABELS MENU_DOMAINS MENU_ACTIONS

# ── Option : réutiliser un domaine existant ───────────────────────────────────
for d in "${DOMAINS[@]}"; do
  src="${DOMAIN_SOURCES[$d]}"
  if [[ "$d" == "$EXISTING_REALM" && -n "$EXISTING_USER" ]]; then
    MENU_LABELS+=("Réutiliser  ${CYAN}$d${NC}  ${DIM}[$src — credentials existants]${NC}")
    MENU_ACTIONS+=("reuse_existing")
  else
    MENU_LABELS+=("Configurer TURN avec  ${CYAN}$d${NC}  ${DIM}[$src]${NC}")
    MENU_ACTIONS+=("use_domain")
  fi
  MENU_DOMAINS+=("$d")
  ((IDX++))
done

# ── Option : installation complète (IP) ──────────────────────────────────────
MENU_LABELS+=("Installation complète — utiliser l'IP  ${CYAN}${PUBLIC_IP:-du serveur}${NC}  comme realm")
MENU_ACTIONS+=("full_install_ip")
MENU_DOMAINS+=("${PUBLIC_IP:-}")
IP_OPTION_IDX=$IDX; ((IDX++))

# ── Option : domaine personnalisé ─────────────────────────────────────────────
MENU_LABELS+=("Entrer un domaine manuellement")
MENU_ACTIONS+=("custom_domain")
MENU_DOMAINS+=("")
CUSTOM_OPTION_IDX=$IDX; ((IDX++))

# ── Affichage du menu ─────────────────────────────────────────────────────────
for i in "${!MENU_LABELS[@]}"; do
  echo -e "  ${BOLD}[$((i+1))]${NC} ${MENU_LABELS[$i]}"
done
echo -e "  ${BOLD}[0]${NC} Annuler"
echo

# ── Saisie ────────────────────────────────────────────────────────────────────
while true; do
  read -rp "  Votre choix : " CHOICE
  if [[ "$CHOICE" == "0" ]]; then
    echo; log_info "Annulé."; exit 0
  elif [[ "$CHOICE" =~ ^[0-9]+$ ]] && (( CHOICE >= 1 && CHOICE <= ${#MENU_LABELS[@]} )); then
    SELECTED_IDX=$((CHOICE - 1))
    break
  else
    log_warn "Choix invalide. Entrez un numéro entre 0 et ${#MENU_LABELS[@]}."
  fi
done

SELECTED_ACTION="${MENU_ACTIONS[$SELECTED_IDX]}"
SELECTED_DOMAIN="${MENU_DOMAINS[$SELECTED_IDX]}"

# ── Saisie du domaine personnalisé ────────────────────────────────────────────
if [[ "$SELECTED_ACTION" == "custom_domain" ]]; then
  echo
  read -rp "  Domaine (ex: turn.mon-domaine.com) : " SELECTED_DOMAIN
  if [[ -z "$SELECTED_DOMAIN" ]]; then
    log_error "Domaine vide. Annulé."; exit 1
  fi
  SELECTED_ACTION="use_domain"
fi

echo
log_ok "Choix : ${CYAN}$SELECTED_ACTION${NC} → domaine/realm = ${CYAN}${SELECTED_DOMAIN:-IP}${NC}"

# =============================================================================
# Phase 3 — Résolution des credentials
# =============================================================================
log_section "Credentials TURN"

TURN_REALM="${SELECTED_DOMAIN:-$PUBLIC_IP}"
TURN_USER=""
TURN_CRED=""

if [[ "$SELECTED_ACTION" == "reuse_existing" ]]; then
  # Cas simple : coturn tourne déjà avec les bons credentials
  TURN_USER="$EXISTING_USER"
  TURN_CRED="$EXISTING_CRED"
  log_ok "Credentials existants conservés : utilisateur = ${CYAN}$TURN_USER${NC}"

else
  # Nouveau realm choisi — garder les credentials existants si le realm n'a pas changé,
  # sinon générer un nouveau mot de passe (mais garder le nom d'utilisateur si présent)
  TURN_USER="${EXISTING_USER:-p2p}"
  if [[ -n "$EXISTING_CRED" && "$TURN_REALM" == "$EXISTING_REALM" ]]; then
    TURN_CRED="$EXISTING_CRED"
    log_ok "Credential existant conservé pour $TURN_USER"
  else
    TURN_CRED="$(openssl rand -hex 16)"
    if [[ -n "$EXISTING_CRED" && "$TURN_REALM" != "$EXISTING_REALM" ]]; then
      log_info "Realm changé → nouveau mot de passe généré pour $TURN_USER"
    else
      log_info "Nouvel utilisateur TURN généré : ${CYAN}$TURN_USER${NC}"
    fi
  fi
fi

# =============================================================================
# Phase 4 — Installation / configuration coturn
# =============================================================================
if [[ "$SELECTED_ACTION" != "reuse_existing" ]]; then
  log_section "Configuration coturn"

  # ── Installer coturn si absent ────────────────────────────────────────────
  if ! $COTURN_INSTALLED; then
    log_info "Installation de coturn via apt…"
    apt-get update -qq
    apt-get install -y coturn
    COTURN_CONF="/etc/turnserver.conf"
    log_ok "coturn installé"
  fi

  COTURN_CONF="${COTURN_CONF:-/etc/turnserver.conf}"

  # ── Détecter l'IP de liaison (interne) ───────────────────────────────────
  LISTEN_IP=$(ip route get 1.1.1.1 2>/dev/null \
    | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1 || echo "0.0.0.0")

  # ── Écrire (ou réécrire) la config ───────────────────────────────────────
  # Si le fichier existe et que seul le realm/user change, on fait un patch chirurgical.
  # Sinon on crée un fichier minimal.
  if [[ -f "$COTURN_CONF" ]]; then
    log_info "Mise à jour de $COTURN_CONF"

    # Mettre à jour ou ajouter chaque directive clé
    patch_conf() {
      local key="$1" val="$2" file="$3"
      if grep -qE "^#?${key}=" "$file" 2>/dev/null; then
        sed -i "s|^#\?${key}=.*|${key}=${val}|" "$file"
      else
        echo "${key}=${val}" >> "$file"
      fi
    }

    patch_conf "realm"       "$TURN_REALM"  "$COTURN_CONF"
    patch_conf "external-ip" "$PUBLIC_IP"   "$COTURN_CONF"
    patch_conf "relay-ip"    "$PUBLIC_IP"   "$COTURN_CONF"

    # Activer lt-cred-mech si absent
    grep -qE '^lt-cred-mech' "$COTURN_CONF" || echo "lt-cred-mech" >> "$COTURN_CONF"

    # Remplacer la ligne user= existante ou l'ajouter
    if grep -qE '^user=' "$COTURN_CONF" 2>/dev/null; then
      sed -i "s|^user=.*|user=${TURN_USER}:${TURN_CRED}|" "$COTURN_CONF"
    else
      echo "user=${TURN_USER}:${TURN_CRED}" >> "$COTURN_CONF"
    fi

    log_ok "Config mise à jour"
  else
    log_info "Création de $COTURN_CONF"
    cat > "$COTURN_CONF" <<CONF
# coturn — généré par install-coturn.sh
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=$PUBLIC_IP
external-ip=$PUBLIC_IP
realm=$TURN_REALM
lt-cred-mech
user=$TURN_USER:$TURN_CRED
log-file=/var/log/turnserver.log
simple-log
no-cli
CONF
    log_ok "$COTURN_CONF créé"
  fi

  # ── Activer le démon (requis sur Debian/Ubuntu) ───────────────────────────
  COTURN_DEFAULT="/etc/default/coturn"
  if [[ -f "$COTURN_DEFAULT" ]]; then
    if ! grep -qE '^TURNSERVER_ENABLED=1' "$COTURN_DEFAULT" 2>/dev/null; then
      sed -i 's|^#\?TURNSERVER_ENABLED=.*|TURNSERVER_ENABLED=1|' "$COTURN_DEFAULT" 2>/dev/null \
        || echo "TURNSERVER_ENABLED=1" >> "$COTURN_DEFAULT"
      log_ok "TURNSERVER_ENABLED=1 activé dans $COTURN_DEFAULT"
    fi
  fi

  # ── Ouvrir les ports ufw ──────────────────────────────────────────────────
  if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 3478/udp comment "TURN UDP"  &>/dev/null || true
    ufw allow 3478/tcp comment "TURN TCP"  &>/dev/null || true
    ufw allow 5349/tcp comment "TURNS TLS" &>/dev/null || true
    log_ok "Ports 3478 (UDP/TCP) et 5349 (TCP) ouverts dans ufw"
  fi
fi

# =============================================================================
# Phase 5 — Redémarrage du service
# =============================================================================
log_section "Service coturn"

if systemctl is-active --quiet coturn 2>/dev/null; then
  systemctl reload-or-restart coturn
  log_ok "Service coturn redémarré"
else
  systemctl enable coturn 2>/dev/null || true
  systemctl start  coturn
  log_ok "Service coturn démarré"
fi

sleep 1

if systemctl is-active --quiet coturn 2>/dev/null; then
  log_ok "coturn actif — port 3478 (UDP + TCP)"
else
  log_warn "coturn ne semble pas actif. Vérifier : journalctl -u coturn -n 50"
fi

# =============================================================================
# Phase 6 — Écriture des variables VITE_ dans apps/desktop/.env
# =============================================================================
log_section "Mise à jour de apps/desktop/.env"

TURN_URL_VALUE="turn:${TURN_REALM}:3478?transport=udp"

update_env_var() {
  local key="$1" value="$2" file="$3"
  touch "$file"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

update_env_var "VITE_TURN_URL"        "$TURN_URL_VALUE" "$DESKTOP_ENV"
update_env_var "VITE_TURN_USERNAME"   "$TURN_USER"      "$DESKTOP_ENV"
update_env_var "VITE_TURN_CREDENTIAL" "$TURN_CRED"      "$DESKTOP_ENV"

log_ok ".env mis à jour : $DESKTOP_ENV"

# =============================================================================
# Phase 7 — Résumé
# =============================================================================
log_section "Résumé"

echo -e "${BOLD}Serveur TURN :${NC}"
echo -e "  Realm        : ${GREEN}$TURN_REALM${NC}"
echo -e "  IP publique  : ${GREEN}$PUBLIC_IP${NC}"
echo -e "  Port         : ${GREEN}3478 (UDP + TCP)${NC}"
echo -e "  Utilisateur  : ${GREEN}$TURN_USER${NC}"
echo -e "  Credential   : ${GREEN}$TURN_CRED${NC}"
echo
echo -e "${BOLD}Variables dans apps/desktop/.env :${NC}"
echo -e "  ${YELLOW}VITE_TURN_URL${NC}        = $TURN_URL_VALUE"
echo -e "  ${YELLOW}VITE_TURN_USERNAME${NC}   = $TURN_USER"
echo -e "  ${YELLOW}VITE_TURN_CREDENTIAL${NC} = $TURN_CRED"
echo

# Avertissement DNS si domaine personnalisé
if echo "$TURN_REALM" | grep -qE '[a-zA-Z]' && [[ "$TURN_REALM" != "$PUBLIC_IP" ]]; then
  echo -e "${YELLOW}${BOLD}Important — DNS :${NC}"
  echo -e "  Vérifiez que ${CYAN}$TURN_REALM${NC} pointe vers ${CYAN}$PUBLIC_IP${NC}"
  echo -e "  ${DIM}(enregistrement A dans votre gestionnaire DNS)${NC}"
  echo
fi

echo -e "${BOLD}Étapes suivantes :${NC}"
echo
echo -e "  ${BOLD}1. Tester le serveur TURN (avant de rebuilder)${NC}"
echo -e "     Le test vérifie que coturn est joignable depuis Internet."
echo -e "     Ouvrir cette page dans un navigateur :"
echo -e "     ${BLUE}https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/${NC}"
echo
echo -e "     Remplir le formulaire :"
echo -e "       ${DIM}STUN or TURN URI${NC}  →  ${CYAN}turn:$TURN_REALM:3478${NC}"
echo -e "       ${DIM}TURN username${NC}     →  ${CYAN}$TURN_USER${NC}"
echo -e "       ${DIM}TURN password${NC}     →  ${CYAN}$TURN_CRED${NC}"
echo -e "     Cliquer ${BOLD}\"Add Server\"${NC} puis ${BOLD}\"Gather candidates\"${NC}."
echo
echo -e "     Lire les résultats :"
echo -e "       ${GREEN}relay${NC}  → TURN fonctionne  ${GREEN}✓${NC}  (candidat relayé par votre serveur)"
echo -e "       ${DIM}srflx${NC}  → STUN seul (IP publique visible, pas de relay)"
echo -e "       ${DIM}host${NC}   → réseau local uniquement"
echo -e "     ${YELLOW}Si aucun candidat \"relay\" n'apparaît :${NC}"
echo -e "       • Vérifier le pare-feu : port 3478 UDP et TCP ouvert ?"
echo -e "       • Vérifier le service  : ${BLUE}systemctl status coturn${NC}"
echo -e "       • Consulter les logs   : ${BLUE}journalctl -u coturn -n 50${NC}"
echo
echo -e "  ${BOLD}2. Rebuilder l'app desktop (une fois le TURN validé)${NC}"
echo -e "     ${BLUE}npm run build -w apps/desktop${NC}"
echo -e "     ${DIM}(les variables VITE_TURN_* sont maintenant dans apps/desktop/.env)${NC}"
echo
log_ok "Terminé."
