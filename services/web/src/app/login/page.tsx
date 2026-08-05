'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, senha);
      router.push('/sites');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-isa-bg">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-6 bg-isa-surface rounded border border-isa-border">
        <h1 className="text-lg font-semibold text-isa-text-primary mb-1">MOURA CONNECT</h1>
        <p className="text-xs text-isa-text-muted mb-6">Monitoramento de Baterias Estacionárias</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-isa-text-secondary mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-isa-panel border border-isa-border rounded text-sm text-isa-text-primary focus:outline-none focus:border-isa-state-active"
              placeholder="operador@exemplo.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-isa-text-secondary mb-1">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full px-3 py-2 bg-isa-panel border border-isa-border rounded text-sm text-isa-text-primary focus:outline-none focus:border-isa-state-active"
              placeholder="••••••"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-isa-alarm-critical border border-isa-alarm-critical/30 bg-isa-alarm-critical/10 px-3 py-2 rounded">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-isa-state-active text-white text-sm font-medium rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  );
}
