import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api.js";
import type { UserRole } from "@p2p/shared";
import styles from "./MembersPanel.module.css";

interface Member {
  userId:      string;
  username:    string;
  displayName: string;
  role:        UserRole;
  joinedAt:    string;
}

interface Props {
  conversationId: string;
  currentUserId:  string;
  currentRole:    UserRole;
  onClose:        () => void;
}

const RANK: Record<UserRole, number> = { owner: 3, moderator: 2, member: 1, guest: 0 };
const ROLES: UserRole[] = ["owner", "moderator", "member", "guest"];

export default function MembersPanel({ conversationId, currentUserId, currentRole, onClose }: Props) {
  const [members, setMembers]   = useState<Member[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [pending, setPending]   = useState<Record<string, boolean>>({});

  const canManage = currentRole === "owner" || currentRole === "moderator";

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ members: Member[] }>(`/api/conversations/${conversationId}/members`);
      setMembers(res.members);
    } catch {
      setError("Impossible de charger les membres");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void fetchMembers(); }, [fetchMembers]);

  const changeRole = async (targetUserId: string, newRole: UserRole) => {
    setPending((p) => ({ ...p, [targetUserId]: true }));
    try {
      await api.put(`/api/conversations/${conversationId}/members/${targetUserId}/role`, { role: newRole });
      setMembers((prev) => prev.map((m) => m.userId === targetUserId ? { ...m, role: newRole } : m));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors du changement de rôle");
    } finally {
      setPending((p) => ({ ...p, [targetUserId]: false }));
    }
  };

  const kick = async (targetUserId: string, displayName: string) => {
    if (!confirm(`Exclure ${displayName} de la conversation ?`)) return;
    setPending((p) => ({ ...p, [targetUserId]: true }));
    try {
      await api.delete(`/api/conversations/${conversationId}/members/${targetUserId}`);
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de l'exclusion");
      setPending((p) => ({ ...p, [targetUserId]: false }));
    }
  };

  // Roles the current user can assign to a target
  const assignableRoles = (targetRole: UserRole): UserRole[] => {
    if (currentRole === "owner") return ROLES;
    // Moderator can only assign member/guest
    return ROLES.filter((r) => RANK[r] < RANK["moderator"]);
  };

  const canActOn = (target: Member): boolean => {
    if (target.userId === currentUserId) return false;
    return RANK[currentRole] > RANK[target.role];
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Membres</span>
        <button className={styles.closeBtn} onClick={onClose} title="Fermer">✕</button>
      </div>

      {loading && <p className={styles.muted}>Chargement…</p>}
      {error   && <p className={styles.errorMsg}>{error}</p>}

      {!loading && !error && (
        <ul className={styles.list}>
          {members.map((m) => (
            <li key={m.userId} className={styles.memberRow}>
              <div className={styles.avatar}>{(m.displayName || m.username)[0]?.toUpperCase()}</div>
              <div className={styles.info}>
                <span className={styles.displayName}>{m.displayName}</span>
                <span className={styles.username}>@{m.username}</span>
              </div>

              {canManage && canActOn(m) ? (
                <div className={styles.actions}>
                  <select
                    className={styles.roleSelect}
                    value={m.role}
                    disabled={!!pending[m.userId]}
                    onChange={(e) => void changeRole(m.userId, e.target.value as UserRole)}
                  >
                    {assignableRoles(m.role).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button
                    className={styles.kickBtn}
                    disabled={!!pending[m.userId]}
                    onClick={() => void kick(m.userId, m.displayName)}
                    title={`Exclure ${m.displayName}`}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span className={`${styles.roleBadge} ${styles[`role_${m.role}`]}`}>{m.role}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
