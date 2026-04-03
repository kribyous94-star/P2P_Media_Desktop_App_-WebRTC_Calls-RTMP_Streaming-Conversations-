import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@p2p/shared";
import { api, ApiError } from "@/lib/api.js";
import { useWsStore } from "./ws.store.js";

const WS_URL = import.meta.env["VITE_WS_URL"] ?? "ws://localhost:3001/ws";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  register: (data: RegisterInput) => Promise<void>;
  login:    (data: LoginInput)    => Promise<void>;
  logout:   ()                    => Promise<void>;
  setAuth:  (user: User, token: string) => void;
  clearAuth: ()                   => void;
}

interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      register: async (data) => {
        const res = await api.post<AuthResponse>("/api/auth/register", data);
        get().setAuth(res.user, res.token);
      },

      login: async (data) => {
        const res = await api.post<AuthResponse>("/api/auth/login", data);
        get().setAuth(res.user, res.token);
      },

      logout: async () => {
        try {
          await api.post("/api/auth/logout", {});
        } catch (e) {
          // Ignorer les erreurs réseau au logout — on déco quand même
          if (!(e instanceof ApiError)) console.error(e);
        }
        get().clearAuth();
      },

      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: true });
        // Connecter le WebSocket après authentification
        useWsStore.getState().connect(WS_URL, token);
      },

      clearAuth: () => {
        useWsStore.getState().disconnect();
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: "p2p-auth",
      partialize: (state) => ({
        user:            state.user,
        token:           state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      // À l'hydratation depuis localStorage, reconnecter le WebSocket si token présent
      onRehydrateStorage: () => (state) => {
        if (state?.token && state.isAuthenticated) {
          useWsStore.getState().connect(WS_URL, state.token);
        }
      },
    }
  )
);
