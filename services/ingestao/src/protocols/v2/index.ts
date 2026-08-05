import { ProtocolHandler, LeituraRaw } from '../types.js';
import { msgpackCodec } from './codec.js';
import { v2Schema } from './schema.js';

const MODO_MAP: Record<number, LeituraRaw['modo']> = {
  0: 'flutuacao',
  1: 'descarga',
  2: 'recarga',
};

interface V2Raw {
  b: string;
  s: string;
  ts: number;
  v: number;
  a: number;
  t: number;
  soc: number;
  m: number;
}

export const v2Handler: ProtocolHandler = {
  version: 'v2',
  codec: msgpackCodec,
  schema: v2Schema,
  normalize(validated: unknown): LeituraRaw {
    const raw = validated as V2Raw;
    return {
      bancoId: raw.b,
      siteId: raw.s,
      timestamp: new Date(raw.ts).toISOString(),
      tensaoV: raw.v,
      correnteA: raw.a,
      temperaturaC: raw.t,
      estadoCarga: raw.soc,
      modo: MODO_MAP[raw.m] ?? 'flutuacao',
    };
  },
};
