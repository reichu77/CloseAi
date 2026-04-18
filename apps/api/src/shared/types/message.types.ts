export type Channel = 'whatsapp' | 'instagram' | 'widget'

export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'interactive'

export interface IncomingMessage {
  id: string
  channel: Channel
  clientId: string
  contactId: string
  contactName?: string
  type: MessageType
  text?: string
  mediaUrl?: string
  timestamp: Date
  raw: Record<string, unknown>
}

export interface OutgoingMessage {
  channel: Channel
  contactId: string
  clientId: string
  text: string
  replyToMessageId?: string
}

// Estado de qualificação do lead — actualizado incrementalmente a cada turno
export interface LeadState {
  name?: string
  intent?: 'compra' | 'arrendamento'
  budgetMax?: number
  zone?: string
  shownPropertyRefs?: string[]       // referências dos imóveis já mostrados
  qualificationComplete?: boolean    // temos intent + budget + zone
  requestedHuman?: boolean           // pediu falar com humano
}

export interface ConversationSession {
  sessionId: string
  clientId: string
  contactId: string
  channel: Channel
  messages: SessionMessage[]
  leadState: LeadState
  createdAt: Date
  updatedAt: Date
}

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}
