import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@p2p/shared";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) =>
        set({ user, token, isAuthenticated: true }),

      clearAuth: () =>
        set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: "p2p-auth",
      // Ne persister que le token et les infos user — jamais l'état dérivé
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
