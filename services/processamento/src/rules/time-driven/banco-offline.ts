import * as stateRepo from '../../repositories/state.repo.js';
import * as alertManager from '../../alerts/alert-manager.js';
import { getAllBancos } from '../../repositories/bancos.repo.js';
import { config } from '../../config.js';

/**
 * Regra: Banco Offline (Severidade: Alta)
 * Dispara quando nenhuma leitura é recebida de um banco por mais de 10 minutos.
 * Resolve quando uma leitura chega (chamado pelo engine ao receber leitura).
 *
 * Esta regra é baseada em timer (cron), não em leitura recebida.
 */
export async function verificarBancosOffline(): Promise<void> {
  const bancos = await getAllBancos();
  const agora = Date.now();

  for (const banco of bancos) {
    const alertKey = `alert:active:${banco.bancoId}:banco_offline`;
    const estadoRaw = await stateRepo.getEstado(banco.bancoId);

    if (!estadoRaw) {
      // Nunca recebeu leitura ou TTL expirou
      if (!(await stateRepo.alertExists(alertKey))) {
        await alertManager.abrirAlerta(
          { bancoId: banco.bancoId, siteId: banco.siteId },
          'banco_offline',
          'alta'
        );
      }
    } else {
      const { receivedAt } = JSON.parse(estadoRaw);
      if (agora - receivedAt > config.rules.offlineThresholdMs) {
        if (!(await stateRepo.alertExists(alertKey))) {
          await alertManager.abrirAlerta(
            { bancoId: banco.bancoId, siteId: banco.siteId },
            'banco_offline',
            'alta'
          );
        }
      }
    }
  }
}

/**
 * Chamado quando uma leitura chega — resolve alerta offline se existia.
 */
export async function resolverOfflineSeNecessario(bancoId: string): Promise<void> {
  const alertKey = `alert:active:${bancoId}:banco_offline`;

  if (await stateRepo.alertExists(alertKey)) {
    await alertManager.fecharAlerta(bancoId, 'banco_offline');
  }
}
