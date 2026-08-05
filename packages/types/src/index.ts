// ─── Quality ────────────────────────────────────────────────────

/** Indicador de qualidade do dado recebido */
export interface QualityIndicator {
  latencyMs: number;
  fresh: boolean;
  duplicate: boolean;
  score: number;
}

// ─── Telemetria ─────────────────────────────────────────────────

/** Formato canônico de uma leitura de telemetria (Kafka) */
export interface Leitura {
  bancoId: string;
  siteId: string;
  timestamp: string;
  tensaoV: number;
  correnteA: number;
  temperaturaC: number;
  estadoCarga: number;
  modo: 'flutuacao' | 'descarga' | 'recarga';
  _quality?: QualityIndicator;
}

/** Leitura sem o campo _quality (antes da anotação) */
export type LeituraRaw = Omit<Leitura, '_quality'>;

// ─── Alertas ────────────────────────────────────────────────────

export type RegraAlerta = 'tensao_baixa' | 'sobretemperatura' | 'banco_offline' | 'descarga_prolongada';
export type Severidade = 'critica' | 'alta' | 'media';

/** Evento publicado no tópico alertas.eventos */
export interface AlertaEvento {
  alertaId: string;
  bancoId: string;
  siteId: string;
  regra: RegraAlerta;
  severidade: Severidade;
  tipo: 'abertura' | 'resolucao';
  timestamp: string;
  detalhes?: {
    tensaoV?: number;
    temperaturaC?: number;
    modo?: string;
  };
}

// ─── FSM (Máquina de Estados) ───────────────────────────────────

export type BancoState = 'normal' | 'degradado' | 'alerta' | 'critico' | 'offline';

/** Estado FSM persistido no Redis */
export interface FsmState {
  state: BancoState;
  since: string | null;
  activeAlerts: string[];
}

/** Registro de transição de estado */
export interface FsmTransition {
  bancoId: string;
  from: string;
  to: string;
  event: string;
  timestamp: string;
}

// ─── MongoDB Documents ──────────────────────────────────────────

export interface SiteDoc {
  siteId: string;
  nome: string;
  uf: string;
  cidade: string;
  contratoId: string;
}

export interface BancoDoc {
  bancoId: string;
  siteId: string;
  contratoId: string;
  modelo: string;
  capacidadeAh: number;
  tensaoNominalV: number;
  instaladoEm: string;
}

/** Informação básica de um banco (subset para queries leves) */
export interface BancoInfo {
  bancoId: string;
  siteId: string;
  contratoId: string;
}

export interface AlertaDoc {
  alertaId: string;
  bancoId: string;
  siteId: string;
  regra: string;
  severidade: string;
  status: string;
  aberturaEm: Date;
  detalhes?: Record<string, unknown>;
  reconhecidoPor?: string;
  reconhecidoEm?: Date;
  resolvidoEm?: Date;
}

export interface UsuarioDoc {
  email: string;
  nome: string;
  perfil: 'operador' | 'cliente';
  contratos: string[];
  senhaHash: string;
}

export interface LeituraDoc {
  bancoId: string;
  siteId: string;
  timestamp: Date;
  tensaoV: number;
  correnteA: number;
  temperaturaC: number;
  estadoCarga: number;
  modo: string;
  _quality?: QualityIndicator;
  _ingestedAt: Date;
}

// ─── DTOs (respostas da API) ────────────────────────────────────

export interface SiteOverview {
  siteId: string;
  nome: string;
  uf: string;
  cidade: string;
  contratoId: string;
  totalBancos: number;
  alertasAtivos: number;
  alertaCritico: boolean;
  minQualityScore: number;
  worstState: string;
}

export interface BancoOverview {
  bancoId: string;
  siteId: string;
  modelo: string;
  capacidadeAh: number;
  tensaoNominalV: number;
  ultimaLeitura: unknown;
  state: string;
  activeAlerts: string[];
  alertasAtivos: string[];
  temAlerta: boolean;
}

export interface PaginatedLeituras {
  dados: LeituraDoc[];
  paginacao: {
    pagina: number;
    porPagina: number;
    total: number;
    totalPaginas: number;
  };
}

export interface EstadoFsmResponse {
  state: string;
  since: string | null;
  activeAlerts: string[];
  transitions: FsmTransition[];
}
