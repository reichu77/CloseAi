import type { ClientContext } from './orchestrator'
import { logger } from '../../shared/utils/logger'

// Guardrails básicos para o MVP.
// Expande aqui: detecção de alucinações de preço, PII leaking, etc.

const PRICE_PATTERN = /€\s?\d+|\d+\s?euros?|\d+[.,]\d{2}\s?€/gi

export const guardrails = {
  validate(reply: string, ctx: ClientContext): string {
    // Se o agente menciona preços mas o catálogo está vazio, remove e substitui
    if (ctx.catalogChunks.length === 0 && PRICE_PATTERN.test(reply)) {
      logger.warn(
        { clientId: ctx.clientId },
        'Guardrail: agent mentioned prices with empty catalog — sanitizing',
      )
      return reply.replace(
        PRICE_PATTERN,
        '[preço a confirmar pela equipa]',
      )
    }

    // Trunca respostas muito longas para WhatsApp
    if (reply.length > 1500) {
      logger.warn({ clientId: ctx.clientId }, 'Guardrail: reply too long, truncating')
      return reply.slice(0, 1450) + '...'
    }

    return reply
  },
}
