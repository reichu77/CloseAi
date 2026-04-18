import Redis from 'ioredis'
import { config } from '../../config'
import type { ConversationSession, SessionMessage, LeadState } from '../../shared/types/message.types'

const redis = new Redis(config.REDIS_URL)

const SESSION_TTL    = 60 * 60 * 4   // 4 horas
const MAX_MESSAGES   = 30            // janela total guardada em Redis
const CONTEXT_WINDOW = 12            // mensagens enviadas ao LLM (as mais recentes)

function sessionKey(clientId: string, contactId: string): string {
  return `session:${clientId}:${contactId}`
}

function emptySession(
  clientId: string,
  contactId: string,
  channel: ConversationSession['channel'],
): ConversationSession {
  return {
    sessionId: `${clientId}:${contactId}:${Date.now()}`,
    clientId,
    contactId,
    channel,
    messages: [],
    leadState: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export const sessionService = {
  async get(clientId: string, contactId: string): Promise<ConversationSession | null> {
    const raw = await redis.get(sessionKey(clientId, contactId))
    if (!raw) return null
    const s = JSON.parse(raw) as ConversationSession
    if (!s.leadState) s.leadState = {}   // migração de sessões antigas
    return s
  },

  async upsert(
    clientId: string,
    contactId: string,
    channel: ConversationSession['channel'],
    newMessage: SessionMessage,
  ): Promise<ConversationSession> {
    const session = (await this.get(clientId, contactId)) ?? emptySession(clientId, contactId, channel)

    session.messages.push(newMessage)

    if (session.messages.length > MAX_MESSAGES) {
      session.messages = session.messages.slice(-MAX_MESSAGES)
    }

    session.updatedAt = new Date()
    await this._save(session)
    return session
  },

  async appendAssistant(clientId: string, contactId: string, text: string): Promise<void> {
    const session = await this.get(clientId, contactId)
    if (!session) return
    session.messages.push({ role: 'assistant', content: text, timestamp: new Date() })
    session.updatedAt = new Date()
    await this._save(session)
  },

  async updateLeadState(clientId: string, contactId: string, patch: Partial<LeadState>): Promise<void> {
    const session = await this.get(clientId, contactId)
    if (!session) return
    session.leadState = { ...session.leadState, ...patch }
    // Marca qualificação completa quando temos os três campos base
    if (session.leadState.intent && session.leadState.budgetMax && session.leadState.zone) {
      session.leadState.qualificationComplete = true
    }
    session.updatedAt = new Date()
    await this._save(session)
  },

  // Devolve apenas as N mensagens mais recentes para enviar ao LLM
  getContextWindow(session: ConversationSession): SessionMessage[] {
    return session.messages.slice(-CONTEXT_WINDOW)
  },

  async clear(clientId: string, contactId: string): Promise<void> {
    await redis.del(sessionKey(clientId, contactId))
  },

  async _save(session: ConversationSession): Promise<void> {
    await redis.setex(sessionKey(session.clientId, session.contactId), SESSION_TTL, JSON.stringify(session))
  },
}
