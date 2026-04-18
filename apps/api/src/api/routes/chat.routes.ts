import { Router } from 'express'
import { conversationService } from '../../modules/conversation/conversation.service'

const router = Router()

// Endpoint de teste — só disponível em development
// Simula uma mensagem WhatsApp sem precisar da Meta API
router.post('/', async (req, res) => {
  const { message, contactId = 'test-user-001' } = req.body

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Campo "message" obrigatório' })
    return
  }

  try {
    const result = await conversationService.handle({
      id: `test-${Date.now()}`,
      channel: 'whatsapp',
      clientId: 'DEV_PHONE_ID',   // phone_number_id do seed (init.sql)
      contactId,
      type: 'text',
      text: message,
      timestamp: new Date(),
      raw: {},
    })

    res.json({ reply: result.text })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Erro interno' })
  }
})

export default router
