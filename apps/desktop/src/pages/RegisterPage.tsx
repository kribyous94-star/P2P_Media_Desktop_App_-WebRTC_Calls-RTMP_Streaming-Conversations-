import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useAuthStore } from "@/stores/auth.store.js";
import { ApiError } from "@/lib/api.js";
import styles from "./auth.module.css";

interface FormData {
  username:    string;
  displayName: string;
  email:       string;
  password:    string;
  confirm:     string;
}

export default function RegisterPage() {
  const register_ = useAuthStore((s) => s.register);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>();

  const onSubmit = async ({ confirm: _, ...data }: FormData) => {
    setServerError(null);
    try {
      await register_(data);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Erreur inattendue");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Créer un compte</h1>
        <p className={styles.subtitle}>Rejoindre P2P Media</p>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="username">Nom d'utilisateur</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                {...register("username", {
                  required: "Requis",
                  minLength: { value: 3, message: "Minimum 3 caractères" },
                  maxLength: { value: 32, message: "Maximum 32 caractères" },
                  pattern: { value: /^[a-zA-Z0-9_-]+$/, message: "Lettres, chiffres, _ et - uniquement" },
                })}
              />
              {errors.username && <span className={styles.error}>{errors.username.message}</span>}
            </div>

            <div className={styles.field}>
              <label htmlFor="displayName">Nom affiché</label>
              <input
                id="displayName"
                type="text"
                {...register("displayName", { maxLength: { value: 64, message: "Maximum 64 caractères" } })}
              />
              {errors.displayName && <span className={styles.error}>{errors.displayName.message}</span>}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email", {
                required: "Requis",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Email invalide" },
              })}
            />
            {errors.email && <span className={styles.error}>{errors.email.message}</span>}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="password">Mot de passe</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register("password", {
                  required: "Requis",
                  minLength: { value: 8, message: "Minimum 8 caractères" },
                })}
              />
              {errors.password && <span className={styles.error}>{errors.password.message}</span>}
            </div>

            <div className={styles.field}>
              <label htmlFor="confirm">Confirmer</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                {...register("confirm", {
                  required: "Requis",
                  validate: (v) => v === watch("password") || "Les mots de passe ne correspondent pas",
                })}
              />
              {errors.confirm && <span className={styles.error}>{errors.confirm.message}</span>}
            </div>
          </div>

          {serverError && <p className={styles.serverError}>{serverError}</p>}

          <button type="submit" className={styles.btn} disabled={isSubmitting}>
            {isSubmitting ? "Création…" : "Créer le compte"}
          </button>
        </form>

        <p className={styles.footer}>
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
