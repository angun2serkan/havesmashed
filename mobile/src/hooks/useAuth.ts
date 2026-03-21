import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { User } from '../types';

export function useAuth() {
  const { user, token, isAuthenticated, setAuth, setNickname: storeSetNickname, logout: storeLogout } =
    useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (seedPhrase: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.login(seedPhrase);
      const authUser: User = {
        id: data.user_id,
        nickname: data.nickname,
        createdAt: new Date().toISOString(),
        inviteCount: 0,
        isActive: true,
      };
      setAuth(authUser, data.token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth]);

  const register = useCallback(async (inviteToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.register(inviteToken);
      const authUser: User = {
        id: data.user_id,
        nickname: null,
        createdAt: new Date().toISOString(),
        inviteCount: 0,
        isActive: true,
      };
      setAuth(authUser, data.token);
      return data.secret_phrase;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth]);

  const setNickname = useCallback(async (nickname: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.setNickname(nickname);
      storeSetNickname(data.nickname, data.token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set nickname';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [storeSetNickname]);

  const logout = useCallback(() => {
    storeLogout();
  }, [storeLogout]);

  const deleteAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.deleteAccount();
      storeLogout();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [storeLogout]);

  return {
    user,
    token,
    isAuthenticated,
    login,
    register,
    setNickname,
    logout,
    deleteAccount,
    loading,
    error,
  };
}
