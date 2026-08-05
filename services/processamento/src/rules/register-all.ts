import { registerEventRule, registerTimeRule } from './registry.js';
import { tensaoBaixaRule } from './event-driven/tensao-baixa.js';
import { sobretemperaturaRule } from './event-driven/sobretemperatura.js';
import { descargaProlongadaRule } from './event-driven/descarga-prolongada.js';
import { verificarBancosOffline } from './time-driven/banco-offline.js';

/**
 * Registra todas as regras disponíveis.
 * Para adicionar uma nova regra: importar e chamar registerEventRule/registerTimeRule aqui.
 */
export function registerAllRules(): void {
  registerEventRule(tensaoBaixaRule);
  registerEventRule(sobretemperaturaRule);
  registerEventRule(descargaProlongadaRule);
  registerTimeRule('banco_offline', verificarBancosOffline);
}
