import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

// SEC-102: token artık httpOnly cookie (`user_access_token`). Store
// sadece "oturum açık mı" boolean'ını ve user snapshot'ını tutar.
// JavaScript token'a erişemez (XSS exfil imkansız). Eski `token`
// alanı persist version 2 migration ile localStorage'dan silinir.
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (user: User) => void;
  setNickname: (nickname: string) => void;
  setBirthday: (birthday: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setAuth: (user) => set({ user, isAuthenticated: true }),
      setNickname: (nickname) =>
        set((state) => ({
          user: state.user ? { ...state.user, nickname } : null,
        })),
      setBirthday: (birthday) =>
        set((state) => ({
          user: state.user ? { ...state.user, birthday } : null,
        })),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "havesmashed-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // version 2 — SEC-102: legacy `token` alanını localStorage'dan
      // temizle. Cookie yoksa zaten ilk request 401 alacak → kullanıcı
      // login sayfasına yönlenir, sonra cookie ile taze giriş.
      version: 2,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = (persistedState ?? {}) as Record<string, unknown>;
        if (fromVersion < 2) {
          if ("token" in state) delete state.token;
          // Eski session'ları drop et — cookie yok, isAuthenticated true
          // tutmak yanıltıcı (ilk istekte zaten 401 alıp logout edilecek).
          state.isAuthenticated = false;
          state.user = null;
        }
        return state;
      },
    },
  ),
);
