import { Rule } from './types.js';

const eventDrivenRules: Rule[] = [];
const timeDrivenCallbacks: Array<{ name: string; fn: () => Promise<void> }> = [];

/** Registra uma regra event-driven (acionada por leitura) */
export function registerEventRule(rule: Rule): void {
  eventDrivenRules.push(rule);
  console.log(`[rules] Regra registrada (event): ${rule.name}`);
}

/** Registra uma regra time-driven (acionada por timer) */
export function registerTimeRule(name: string, fn: () => Promise<void>): void {
  timeDrivenCallbacks.push({ name, fn });
  console.log(`[rules] Regra registrada (time): ${name}`);
}

export function getEventRules(): Rule[] {
  return eventDrivenRules;
}

export function getTimeRules(): Array<{ name: string; fn: () => Promise<void> }> {
  return timeDrivenCallbacks;
}

export function getRegisteredNames(): string[] {
  return [
    ...eventDrivenRules.map((r) => `event:${r.name}`),
    ...timeDrivenCallbacks.map((r) => `time:${r.name}`),
  ];
}
