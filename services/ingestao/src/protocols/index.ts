import { register, getHandler, getRegisteredVersions } from './registry.js';
import { v1Handler } from './v1/index.js';
import { v2Handler } from './v2/index.js';

export function registerAllProtocols(): void {
  register(v1Handler);
  register(v2Handler);
}

export { getHandler, getRegisteredVersions };
export type { Leitura, LeituraRaw, QualityIndicator, ProtocolHandler } from './types.js';
