import { Type, Static } from '@sinclair/typebox';

// ─── Shared ────────────────────────────────────────────────────

export const ErrorResponse = Type.Object({
  error: Type.String(),
});
export type ErrorResponseType = Static<typeof ErrorResponse>;

const BancoStateEnum = Type.Union([
  Type.Literal('normal'),
  Type.Literal('degradado'),
  Type.Literal('alerta'),
  Type.Literal('critico'),
  Type.Literal('offline'),
]);

// ─── Auth ──────────────────────────────────────────────────────

export const LoginBody = Type.Object({
  email: Type.String({ format: 'email' }),
  senha: Type.String({ minLength: 1 }),
});
export type LoginBodyType = Static<typeof LoginBody>;

export const LoginResponse = Type.Object({
  token: Type.String(),
  usuario: Type.Object({
    email: Type.String(),
    nome: Type.String(),
    perfil: Type.Union([Type.Literal('operador'), Type.Literal('cliente')]),
    contratos: Type.Array(Type.String()),
  }),
});
export type LoginResponseType = Static<typeof LoginResponse>;

// ─── Sites ─────────────────────────────────────────────────────

export const SiteParams = Type.Object({
  siteId: Type.String({ minLength: 1 }),
});
export type SiteParamsType = Static<typeof SiteParams>;

export const SiteItem = Type.Object({
  siteId: Type.String(),
  nome: Type.String(),
  uf: Type.String(),
  cidade: Type.String(),
  totalBancos: Type.Number(),
  alertasAtivos: Type.Number(),
  alertaCritico: Type.Boolean(),
  worstState: BancoStateEnum,
  minQualityScore: Type.Number(),
});

export const SiteListResponse = Type.Array(SiteItem);

export const BancoItem = Type.Object({
  bancoId: Type.String(),
  siteId: Type.String(),
  modelo: Type.String(),
  capacidadeAh: Type.Number(),
  tensaoNominalV: Type.Number(),
  state: BancoStateEnum,
  temAlerta: Type.Boolean(),
  alertasAtivos: Type.Array(Type.String()),
  activeAlerts: Type.Array(Type.String()),
  ultimaLeitura: Type.Any(),
});

export const BancoListResponse = Type.Array(BancoItem);

// ─── Bancos ────────────────────────────────────────────────────

export const BancoParams = Type.Object({
  bancoId: Type.String({ minLength: 1 }),
});
export type BancoParamsType = Static<typeof BancoParams>;

export const LeiturasQuery = Type.Object({
  de: Type.Optional(Type.String()),
  ate: Type.Optional(Type.String()),
  pagina: Type.Optional(Type.String({ pattern: '^[0-9]+$', default: '1' })),
});
export type LeiturasQueryType = Static<typeof LeiturasQuery>;

export const EstadoFsmResponse = Type.Object({
  state: BancoStateEnum,
  since: Type.Union([Type.String(), Type.Null()]),
  activeAlerts: Type.Array(Type.String()),
  transitions: Type.Array(Type.Object({
    bancoId: Type.String(),
    from: Type.String(),
    to: Type.String(),
    event: Type.String(),
    timestamp: Type.String(),
  })),
});

export const PaginacaoResponse = Type.Object({
  dados: Type.Array(Type.Any()),
  paginacao: Type.Object({
    pagina: Type.Number(),
    porPagina: Type.Number(),
    total: Type.Number(),
    totalPaginas: Type.Number(),
  }),
});

// ─── Alertas ───────────────────────────────────────────────────

export const AlertasQuery = Type.Object({
  status: Type.Optional(Type.Union([Type.Literal('ativo'), Type.Literal('resolvido')])),
  reconhecido: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
});
export type AlertasQueryType = Static<typeof AlertasQuery>;

export const AlertaItem = Type.Object({
  alertaId: Type.String(),
  bancoId: Type.String(),
  siteId: Type.String(),
  regra: Type.String(),
  severidade: Type.String(),
  status: Type.String(),
  aberturaEm: Type.Any(),
  detalhes: Type.Optional(Type.Any()),
  reconhecidoPor: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  reconhecidoEm: Type.Optional(Type.Any()),
  resolvidoEm: Type.Optional(Type.Any()),
});

export const AlertaListResponse = Type.Array(AlertaItem);

export const AlertaIdParams = Type.Object({
  id: Type.String({ minLength: 1 }),
});
export type AlertaIdParamsType = Static<typeof AlertaIdParams>;

export const ReconhecerBody = Type.Object({
  reconhecido: Type.Literal(true),
});
export type ReconhecerBodyType = Static<typeof ReconhecerBody>;

export const OkResponse = Type.Object({
  ok: Type.Boolean(),
});
