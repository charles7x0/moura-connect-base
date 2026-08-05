// Re-export shared types
export type { Leitura, LeituraRaw, QualityIndicator } from '@moura/types';
import type { LeituraRaw } from '@moura/types';

/** Decodifica bytes brutos → objeto JS (sem validar) */
export interface Codec {
  decode(buffer: Buffer): unknown;
}

/** Valida o objeto JS decodificado contra o schema da versão */
export interface Schema {
  validate(raw: unknown): ValidationResult;
}

export interface ValidationResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Protocol handler = codec + schema + normalizer de uma versão */
export interface ProtocolHandler {
  version: string;
  codec: Codec;
  schema: Schema;
  normalize(validated: unknown): LeituraRaw;
}
