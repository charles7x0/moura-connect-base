import { type } from 'arktype';
import { Schema, ValidationResult } from '../types.js';

const leituraV1 = type({
  bancoId: 'string > 0',
  siteId: 'string > 0',
  timestamp: 'string',
  tensaoV: 'number',
  correnteA: 'number',
  temperaturaC: 'number',
  estadoCarga: '0 <= number <= 1',
  modo: "'flutuacao' | 'descarga' | 'recarga'",
});

export const v1Schema: Schema = {
  validate(raw: unknown): ValidationResult {
    const result = leituraV1(raw);
    if (result instanceof type.errors) {
      return { success: false, error: result.summary };
    }
    return { success: true, data: result };
  },
};
