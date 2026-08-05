import { getAlertProducer } from '../infra/kafka.js';
import { AlertaEvento } from '@moura/types';

/**
 * Publica evento de alerta no tópico alertas.eventos do Kafka.
 */
export async function publicarAlerta(evento: AlertaEvento): Promise<void> {
  const producer = getAlertProducer();
  await producer.send({
    topic: 'alertas.eventos',
    messages: [{ key: evento.bancoId, value: JSON.stringify(evento) }],
  });
}
