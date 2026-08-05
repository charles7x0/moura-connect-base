'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getStoredUser, logout as apiLogout } from '@/lib/api';
import type { Usuario } from '@/types';

interface AuthContextType {
  token: string | null;
  user: Usuario | null;
  isAuthenticated: boolean;
  logout: () => void;
}

// Export the context for use in a Provider
export function useAuth(): AuthContextType {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Usuario | null>(null);

  useEffect(() => {
    const t = getToken();
    const u = getStoredUser();
    if (!t) { router.replace('/login'); return; }
    setToken(t);
    setUser(u);
  }, [router]);

  const handleLogout = () => {
    apiLogout();
    router.replace('/login');
  };

  return { token, user, isAuthenticated: !!token, logout: handleLogout };
}
