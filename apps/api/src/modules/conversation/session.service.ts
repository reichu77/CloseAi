import Redis from 'ioredis'
import { config } from '../../config'
import type { ConversationSession, SessionMessage } from '../../shared/types/message.types'

const redis = new Redis(config.REDIS_URL)

const SESSION_TTL = 60 * 60 * 2 // 2 horas sem atividade
const MAX_MESSAGES = 20 // janela de contexto para o LLM

function sessionKey(clientId: string, contactId: string): string {
  return `session:${clientId}:${contactId}`
}

export const sessionService = {
  async get(clientId: string, contactId: string): Promise<ConversationSession | null> {
    const raw = await redis.get(sessionKey(clientId, contactId))
    if (!raw) return null
    return JSON.parse(raw) as ConversationSession
  },

  async upsert(
    clientId: string,
    contactId: string,
    channel: ConversationSession['channel'],
    newMessage: SessionMessage,
  ): Promise<ConversationSession> {
    const existing = await this.get(clientId, contactId)

    const session: ConversationSession = existing ?? {
      sessionId: `${clientId}:${contactId}:${Date.now()}`,
      clientId,
      contactId,
      channel,
      messages: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    session.messages.push(newMessage)

    // Mantém apenas as últimas N mensagens para não explodir o context window
    if (session.messages.length > MAX_MESSAGES) {
      session.messages = session.messages.slice(-MAX_MESSAGES)
    }

    session.updatedAt = new Date()

    await redis.setex(
      sessionKey(clientId, contactId),
      SESSION_TTL,
      JSON.stringify(session),
    )

    return session
  },

  async appendAssistant(
    clientId: string,
    contactId: string,
    text: string,
  ): Promise<void> {
    const session = await this.get(clientId, contactId)
    if (!session) return

    session.messages.push({ role: 'assistant', content: text, timestamp: new Date() })
    session.updatedAt = new Date()

    await redis.setex(
      sessionKey(clientId, contactId),
      SESSION_TTL,
      JSON.stringify(session),
    )
  },

  async clear(clientId: string, contactId: string): Promise<void> {
    await redis.del(sessionKey(clientId, contactId))
  },
}
