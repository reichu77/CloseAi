import { sessionService } from './session.service'
import { orchestrator } from '../ai/orchestrator'
import { clientService } from '../clients/client.service'
import { ragService } from '../ai/rag.service'
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

    // 1. Guarda mensagem do utilizador na sessão
    const session = await sessionService.upsert(clientId, contactId, channel, {
      role: 'user',
      content: text,
      timestamp: incoming.timestamp,
    })

    // 2. Carrega contexto base do cliente (nome, system prompt override)
    const baseContext = await clientService.getClientContext(clientId)

    // 3. RAG: busca apenas os imóveis relevantes para esta mensagem específica
    //    Em vez de injectar sempre os 20 itens, injeta só os 4 mais relevantes.
    //    Poupa tokens e foca o agente no que interessa para esta conversa.
    const ragChunks = await ragService.getRelevantChunks(baseContext.clientId, text, 4)
    const clientContext = {
      ...baseContext,
      catalogChunks: ragChunks.length > 0 ? ragChunks : baseContext.catalogChunks.slice(0, 6),
    }

    // 4. Orquestrador de IA (com prompt caching e extracção de lead state)
    const { reply, tokensUsed, cacheHit, leadStatePatch } = await orchestrator.run({
      session,
      userMessage: text,
      clientContext,
    })

    logger.info({ clientId, contactId, tokensUsed, cacheHit }, 'Orchestrator replied')

    // 5. Persiste actualizações de lead state (sem chamada extra ao LLM)
    if (Object.keys(leadStatePatch).length > 0) {
      await sessionService.updateLeadState(clientId, contactId, leadStatePatch)
      logger.debug({ clientId, contactId, leadStatePatch }, 'Lead state updated')
    }

    // 6. Guarda resposta do assistente na sessão
    await sessionService.appendAssistant(clientId, contactId, reply)

    return { channel, contactId, clientId, text: reply }
  },
}
