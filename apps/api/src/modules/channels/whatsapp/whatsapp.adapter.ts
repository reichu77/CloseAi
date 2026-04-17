import type { ChannelAdapter } from '../channel.interface'
import type { IncomingMessage, OutgoingMessage } from '../../../shared/types/message.types'
import axios from 'axios'
import { config } from '../../../config'
import { logger } from '../../../shared/utils/logger'

export class WhatsAppAdapter implements ChannelAdapter {
  parseIncoming(raw: Record<string, unknown>): IncomingMessage | null {
    try {
      const entry = (raw as any).entry?.[0]
      const change = entry?.changes?.[0]
      const value = change?.value
      const msg = value?.messages?.[0]

      if (!msg) return null

      // clientId vem do número de telefone do negócio (waba_id ou phone_number_id)
      const clientId = value.metadata?.phone_number_id as string

      return {
        id: msg.id,
        channel: 'whatsapp',
        clientId,
        contactId: msg.from,
        contactName: value.contacts?.[0]?.profile?.name,
        type: msg.type === 'text' ? 'text' : msg.type,
        text: msg.text?.body,
        mediaUrl: msg.image?.id || msg.audio?.id || msg.document?.id,
        timestamp: new Date(Number(msg.timestamp) * 1000),
        raw,
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to parse WhatsApp payload')
      return null
    }
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    await axios.post(
      `https://graph.facebook.com/v19.0/${message.clientId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: message.contactId,
        type: 'text',
        text: { body: message.text },
        ...(message.replyToMessageId && {
          context: { message_id: message.replyToMessageId },
        }),
      },
      {
        headers: {
          Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    )
  }
}
