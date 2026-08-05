'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import type { BancoOverview } from '@/types';

export function useBancos(siteId: string, token: string | null) {
  const [bancos, setBancos] = useState<BancoOverview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<BancoOverview[]>(`/sites/${siteId}/bancos`);
      setBancos(data);
    } catch (err) {
      console.error('Erro ao carregar bancos:', err);
    } finally {
      setLoading(false);
    }
  }, [token, siteId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  return { bancos, loading, refresh: load };
}
