// Contrato comum para mensagens normalizadas de qualquer canal.
// O conversation engine nunca sabe de onde a mensagem veio.

export type Channel = 'whatsapp' | 'instagram' | 'widget'

export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'interactive'

export interface IncomingMessage {
  id: string              // ID único da mensagem no canal origem
  channel: Channel
  clientId: string        // ID da empresa cliente (dono do agente)
  contactId: string       // ID do lead/utilizador no canal (ex: número whatsapp)
  contactName?: string
  type: MessageType
  text?: string
  mediaUrl?: string
  timestamp: Date
  raw: Record<string, unknown>  // Payload original, para debugging
}

export interface OutgoingMessage {
  channel: Channel
  contactId: string
  clientId: string
  text: string
  replyToMessageId?: string
}

export interface ConversationSession {
  sessionId: string
  clientId: string
  contactId: string
  channel: Channel
  messages: SessionMessage[]
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}
