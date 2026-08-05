import { type } from 'arktype';
import { Schema, ValidationResult } from '../types.js';

/**
 * v2 Schema: mesmo modelo que v1, mas campos abreviados para economizar bytes.
 * O device envia keys curtas: b, s, ts, v, a, t, soc, m
 */
const leituraV2 = type({
  b: 'string > 0',       // bancoId
  s: 'string > 0',       // siteId
  ts: 'number',          // timestamp como unix ms
  v: 'number',           // tensaoV
  a: 'number',           // correnteA
  t: 'number',           // temperaturaC
  soc: '0 <= number <= 1', // estadoCarga
  m: '0 | 1 | 2',       // modo: 0=flutuacao, 1=descarga, 2=recarga
});

export const v2Schema: Schema = {
  validate(raw: unknown): ValidationResult {
    const result = leituraV2(raw);
    if (result instanceof type.errors) {
      return { success: false, error: result.summary };
    }
    return { success: true, data: result };
  },
};
