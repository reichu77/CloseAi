import Anthropic from '@anthropic-ai/sdk'
import { config } from '../../config'
import { logger } from '../../shared/utils/logger'
import { buildStaticPrompt, buildDynamicPrompt } from './prompt.builder'
import { guardrails } from './guardrails'
import type { ConversationSession, LeadState } from '../../shared/types/message.types'

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY! })

export interface ClientContext {
  clientId: string
  businessName: string
  systemPromptOverride?: string
  catalogChunks: string[]
}

export interface OrchestratorInput {
  session: ConversationSession
  userMessage: string
  clientContext: ClientContext
}

export interface OrchestratorOutput {
  reply: string
  tokensUsed: number
  cacheHit: boolean
  leadStatePatch: Partial<LeadState>
}

function getTimeOfDay(): 'manhã' | 'tarde' | 'noite' {
  const h = new Date().getHours()
  return h < 12 ? 'manhã' : h < 19 ? 'tarde' : 'noite'
}

// Extrai actualizações de lead state a partir da mensagem do utilizador
// — sem chamada extra ao LLM, usa regras simples
function extractLeadState(userMessage: string, current: LeadState): Partial<LeadState> {
  const patch: Partial<LeadState> = {}
  const msg = userMessage.toLowerCase()

  // Nome
  const nameMatch = userMessage.match(
    /(?:(?:sou|chamo-?me|me chamo|nome[ée]?s?\s+(?:[ée]?)?)\s+(?:o|a)?\s*)([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][a-záéíóúàâêôãõç]{2,})/
  )
  if (nameMatch && !current.name) patch.name = nameMatch[1]

  // Intenção
  if (!current.intent) {
    if (/\b(comprar?|compra|aquisição|adquirir)\b/.test(msg)) patch.intent = 'compra'
    else if (/\b(arrendar?|arrendamento|alugar?|aluguer|renda|arend)\b/.test(msg)) patch.intent = 'arrendamento'
  }

  // Orçamento — "300k", "300.000", "300 mil", "até 300", "máximo 300"
  if (!current.budgetMax) {
    const budgetMatch = msg.match(
      /(?:até|máximo|max\.?|orçamento[^€\d]*)?[€]?\s*(\d[\d.,]*)\s*(?:k|mil|\.000|000)?\s*(?:€|euros?)?/
    )
    if (budgetMatch) {
      let val = parseFloat(budgetMatch[1].replace(/[.,]/g, ''))
      if (val > 0 && val < 10_000)   val *= 1000   // "300" provavelmente são 300k
      if (val >= 10_000 && val <= 10_000_000) patch.budgetMax = val
    }
  }

  // Zona — captura texto após "em", "no", "na", "zona de"
  if (!current.zone) {
    const zoneMatch = userMessage.match(
      /\b(?:em|no|na|zona(?:\s+de)?|zona|municipio|área(?:\s+de)?)\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][a-zA-ZÁáÉéÍíÓóÚúÀàÂâÊêÔôÃãÕõÇç\s]{2,20}?)(?:\s|,|$|\.|!|\?)/
    )
    if (zoneMatch) patch.zone = zoneMatch[1].trim()
  }

  // Pedido de humano
  if (/\b(falar com|quero um|contactar|consultor|pessoa|humano|equipa|chamar)\b/.test(msg)) {
    patch.requestedHuman = true
  }

  return patch
}

export const orchestrator = {
  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const { session, userMessage, clientContext } = input

    if (clientContext.systemPromptOverride) {
      // Sem caching quando há prompt personalizado — pode mudar a qualquer momento
      return this._runSimple(input)
    }

    const promptCtx = {
      ...clientContext,
      leadState: session.leadState,
      messageCount: session.messages.length,
      timeOfDay: getTimeOfDay(),
    }

    // Prompt split: parte estática (cacheável) + parte dinâmica (pequena, por turno)
    const staticPart  = buildStaticPrompt(promptCtx)
    const dynamicPart = buildDynamicPrompt(promptCtx)

    // Janela de contexto — apenas as N mensagens mais recentes
    const contextMessages = session.messages.slice(-12)
    const messages: Anthropic.MessageParam[] = contextMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userMessage) {
      messages.push({ role: 'user', content: userMessage })
    }

    logger.debug(
      {
        clientId: clientContext.clientId,
        messageCount: messages.length,
        leadState: session.leadState,
        staticPromptLen: staticPart.length,
      },
      'Running orchestrator',
    )

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      // Dois blocos de system: estático (cacheado) + dinâmico (fresco)
      // O caching poupa ~80-90% dos tokens de input após a primeira mensagem
      system: [
        {
          type: 'text',
          text: staticPart,
          cache_control: { type: 'ephemeral' },
        } as Anthropic.TextBlockParam & { cache_control: { type: 'ephemeral' } },
        {
          type: 'text',
          text: dynamicPart,
        },
      ],
      messages,
    })

    const rawReply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('')

    const safeReply = guardrails.validate(rawReply, clientContext)

    const usage = response.usage as Anthropic.Usage & {
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }

    const cacheHit = (usage.cache_read_input_tokens ?? 0) > 0

    logger.info(
      {
        clientId: clientContext.clientId,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreation: usage.cache_creation_input_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheHit,
      },
      'Orchestrator replied',
    )

    // Extrai actualizações de lead state sem chamada extra ao LLM
    const leadStatePatch = extractLeadState(userMessage, session.leadState)

    // Detecta referências de imóveis na resposta para evitar repetição
    const refMatches = safeReply.match(/\b([A-Z]{2,4}-\d{3})\b/g)
    if (refMatches?.length) {
      const existing = session.leadState.shownPropertyRefs ?? []
      const merged   = [...new Set([...existing, ...refMatches])]
      if (merged.length !== existing.length) {
        leadStatePatch.shownPropertyRefs = merged
      }
    }

    return {
      reply: safeReply,
      tokensUsed: usage.input_tokens + usage.output_tokens,
      cacheHit,
      leadStatePatch,
    }
  },

  // Fallback sem caching para system prompts customizados
  async _runSimple(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const { session, userMessage, clientContext } = input
    const messages: Anthropic.MessageParam[] = session.messages.slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    }))
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user' || last.content !== userMessage) {
      messages.push({ role: 'user', content: userMessage })
    }
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: clientContext.systemPromptOverride!,
      messages,
    })
    const rawReply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('')
    return {
      reply: guardrails.validate(rawReply, clientContext),
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      cacheHit: false,
      leadStatePatch: {},
    }
  },
}
