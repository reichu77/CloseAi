import type { IncomingMessage, OutgoingMessage } from '../../shared/types/message.types'

// Cada canal (WhatsApp, Instagram, Widget) implementa este contrato.
// O conversation engine chama sendMessage sem saber o canal.
export interface ChannelAdapter {
  sendMessage(message: OutgoingMessage): Promise<void>
  parseIncoming(rawPayload: Record<string, unknown>): IncomingMessage | null
}
