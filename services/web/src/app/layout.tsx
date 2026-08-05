import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Moura Connect — Monitoramento de Baterias',
  description: 'Plataforma de monitoramento preditivo de baterias estacionárias',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-isa-bg text-isa-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
