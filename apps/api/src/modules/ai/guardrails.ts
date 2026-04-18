import type { ClientContext } from './orchestrator'
import { logger } from '../../shared/utils/logger'

const PRICE_PATTERN = /€\s?\d+|\d+\s?euros?|\d+[.,]\d{2}\s?€/gi

export const guardrails = {
  validate(reply: string, ctx: ClientContext): string {
    let result = reply

    // Catálogo vazio mas agente inventou preços → substitui
    if (ctx.catalogChunks.length === 0 && PRICE_PATTERN.test(result)) {
      logger.warn({ clientId: ctx.clientId }, 'Guardrail: preço inventado com catálogo vazio')
      result = result.replace(PRICE_PATTERN, '[valor a confirmar]')
    }

    // Respostas muito longas: corta num ponto final para não parecer truncado
    if (result.length > 1500) {
      logger.warn({ clientId: ctx.clientId }, 'Guardrail: resposta muito longa, a cortar')
      const cutoff = result.lastIndexOf('.', 1400)
      result = cutoff > 800
        ? result.slice(0, cutoff + 1) + '\n\nSe quiseres mais detalhes é só dizer 😊'
        : result.slice(0, 1400) + '...'
    }

    return result
  },
}
