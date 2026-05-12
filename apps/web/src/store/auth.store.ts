import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../services/api';

export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        const { accessToken, refreshToken, user } = data.data;

        localStorage.setItem('olimpo_token', accessToken);
        localStorage.setItem('olimpo_refresh', refreshToken);

        set({ user, token: accessToken, isAuthenticated: true });
      },

      logout: async () => {
        const refreshToken = localStorage.getItem('olimpo_refresh');
        if (refreshToken) {
          await api.post('/auth/logout', { refreshToken }).catch(() => { /* ignore */ });
        }
        localStorage.removeItem('olimpo_token');
        localStorage.removeItem('olimpo_refresh');
        set({ user: null, token: null, isAuthenticated: false });
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'olimpo-auth',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);
