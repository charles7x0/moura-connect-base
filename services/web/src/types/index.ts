export type { SiteOverview, BancoOverview, AlertaDoc, LeituraDoc, BancoState, FsmTransition, EstadoFsmResponse, QualityIndicator } from '@moura/types';

// Frontend-specific types
export interface Usuario {
  email: string;
  nome: string;
  perfil: 'operador' | 'cliente';
  contratos: string[];
}

export interface LoginResponse {
  token: string;
  usuario: Usuario;
}
