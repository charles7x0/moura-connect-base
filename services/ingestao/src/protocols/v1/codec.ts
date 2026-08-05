import { Codec } from '../types.js';

/** v1 Codec: payload é JSON UTF-8 */
export const jsonCodec: Codec = {
  decode(buffer: Buffer): unknown {
    return JSON.parse(buffer.toString('utf-8'));
  },
};
