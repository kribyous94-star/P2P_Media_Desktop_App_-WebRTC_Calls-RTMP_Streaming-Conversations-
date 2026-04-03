import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useConversationStore, type ConversationItem } from "@/stores/conversation.store.js";
import { ApiError } from "@/lib/api.js";
import styles from "./Modal.module.css";

interface Props {
  onClose: () => void;
}

interface FormData {
  name: string;
  type: ConversationItem["type"];
}

export default function CreateConversationModal({ onClose }: Props) {
  const createConversation = useConversationStore((s) => s.createConversation);
  const setActive = useConversationStore((s) => s.setActive);
  const [serverError, setServerError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: { type: "group" },
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const conv = await createConversation(data.name, data.type);
      setActive(conv.id);
      navigate(`/conversations/${conv.id}`);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Erreur inattendue");
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Nouvelle conversation</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="name">Nom</label>
            <input
              id="name"
              type="text"
              autoFocus
              {...register("name", { required: "Requis", maxLength: { value: 128, message: "Max 128 caractères" } })}
            />
            {errors.name && <span className={styles.error}>{errors.name.message}</span>}
          </div>

          <div className={styles.field}>
            <label>Type</label>
            <div className={styles.typeGrid}>
              {([
                { value: "private",    label: "🔒 Privé",      desc: "Conversation 1-1" },
                { value: "group",      label: "👥 Groupe",      desc: "Multi-membres" },
                { value: "media_room", label: "🎬 Salle média", desc: "Appels + stream" },
              ] as const).map((opt) => (
                <label key={opt.value} className={styles.typeOption}>
                  <input type="radio" value={opt.value} {...register("type")} />
                  <div className={styles.typeCard}>
                    <span className={styles.typeLabel}>{opt.label}</span>
                    <span className={styles.typeDesc}>{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {serverError && <p className={styles.serverError}>{serverError}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
              {isSubmitting ? "Création…" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
