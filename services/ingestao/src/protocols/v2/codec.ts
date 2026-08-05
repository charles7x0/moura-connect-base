import { decode } from '@msgpack/msgpack';
import { Codec } from '../types.js';

/** v2 Codec: payload é MessagePack binário */
export const msgpackCodec: Codec = {
  decode(buffer: Buffer): unknown {
    return decode(buffer);
  },
};
