import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useAuthStore } from "@/stores/auth.store.js";
import { ApiError } from "@/lib/api.js";
import styles from "./auth.module.css";

interface FormData {
  email:    string;
  password: string;
}

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      await login(data);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Erreur inattendue");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Connexion</h1>
        <p className={styles.subtitle}>Bon retour sur P2P Media</p>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email", {
                required: "Email requis",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Email invalide" },
              })}
            />
            {errors.email && <span className={styles.error}>{errors.email.message}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password", { required: "Mot de passe requis" })}
            />
            {errors.password && <span className={styles.error}>{errors.password.message}</span>}
          </div>

          {serverError && <p className={styles.serverError}>{serverError}</p>}

          <button type="submit" className={styles.btn} disabled={isSubmitting}>
            {isSubmitting ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className={styles.footer}>
          Pas encore de compte ?{" "}
          <Link to="/register">Créer un compte</Link>
        </p>
      </div>
    </div>
  );
}
