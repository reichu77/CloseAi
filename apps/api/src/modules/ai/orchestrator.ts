import Anthropic from '@anthropic-ai/sdk'
import { config } from '../../config'
import { logger } from '../../shared/utils/logger'
import { promptBuilder } from './prompt.builder'
import { guardrails } from './guardrails'
import type { ConversationSession } from '../../shared/types/message.types'

// Inicializa apenas o provider configurado
const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY! })

export interface OrchestratorInput {
  session: ConversationSession
  userMessage: string
  clientContext: ClientContext  // carregado do MySQL
}

export interface ClientContext {
  clientId: string
  businessName: string
  systemPromptOverride?: string
  catalogChunks: string[]       // chunks relevantes do catálogo (RAG)
}

export interface OrchestratorOutput {
  reply: string
  tokensUsed: number
}

export const orchestrator = {
  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const { session, userMessage, clientContext } = input

    const systemPrompt = promptBuilder.build(clientContext)

    // Historial de mensagens formatado para o LLM
    const messages: Anthropic.MessageParam[] = session.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Adiciona a mensagem atual do utilizador (já está na sessão, mas garantimos)
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userMessage) {
      messages.push({ role: 'user', content: userMessage })
    }

    logger.debug(
      { clientId: clientContext.clientId, messageCount: messages.length },
      'Running orchestrator',
    )

    if (!anthropic) throw new Error('AI provider not configured')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    const rawReply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('')

    // Guardrails: valida que o agente não inventou preços ou fez promessas falsas
    const safeReply = guardrails.validate(rawReply, clientContext)

    return {
      reply: safeReply,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    }
  },
}
