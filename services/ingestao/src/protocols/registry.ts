import { ProtocolHandler } from './types.js';

const handlers = new Map<string, ProtocolHandler>();

export function register(handler: ProtocolHandler): void {
  handlers.set(handler.version, handler);
  console.log(`[registry] Protocolo registrado: ${handler.version}`);
}

export function getHandler(version: string): ProtocolHandler | undefined {
  return handlers.get(version);
}

export function getRegisteredVersions(): string[] {
  return Array.from(handlers.keys());
}
