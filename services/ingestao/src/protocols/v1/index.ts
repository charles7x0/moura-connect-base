import { ProtocolHandler, LeituraRaw } from '../types.js';
import { jsonCodec } from './codec.js';
import { v1Schema } from './schema.js';

/** v1: JSON com todos os campos no formato canônico. Normalização é identidade. */
export const v1Handler: ProtocolHandler = {
  version: 'v1',
  codec: jsonCodec,
  schema: v1Schema,
  normalize(validated: unknown): LeituraRaw {
    return validated as LeituraRaw;
  },
};
