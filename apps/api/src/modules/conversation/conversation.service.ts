import { sessionService } from './session.service'
import { orchestrator } from '../ai/orchestrator'
import { clientService } from '../clients/client.service'
import { logger } from '../../shared/utils/logger'
import type { IncomingMessage, OutgoingMessage } from '../../shared/types/message.types'

export const conversationService = {
  async handle(incoming: IncomingMessage): Promise<OutgoingMessage> {
    const { clientId, contactId, channel, text } = incoming

    if (!text) {
      return {
        channel,
        contactId,
        clientId,
        text: 'Por enquanto só consigo responder a mensagens de texto. Em breve terei mais capacidades!',
      }
    }

    // 1. Guarda mensagem do utilizador na sessão Redis
    const session = await sessionService.upsert(clientId, contactId, channel, {
      role: 'user',
      content: text,
      timestamp: incoming.timestamp,
    })

    // 2. Carrega contexto do cliente (catálogo, system prompt, etc.)
    const clientContext = await clientService.getClientContext(clientId)

    // 3. Corre o orquestrador de IA
    const { reply, tokensUsed } = await orchestrator.run({
      session,
      userMessage: text,
      clientContext,
    })

    logger.info({ clientId, contactId, tokensUsed }, 'Orchestrator replied')

    // 4. Guarda resposta do assistente na sessão
    await sessionService.appendAssistant(clientId, contactId, reply)

    return { channel, contactId, clientId, text: reply }
  },
}
