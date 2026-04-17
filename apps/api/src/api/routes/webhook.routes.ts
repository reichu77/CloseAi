import { Router } from 'express'
import { verifyWebhook, receiveMessage } from '../../modules/channels/whatsapp/webhook.handler'
import { conversationService } from '../../modules/conversation/conversation.service'
import { WhatsAppAdapter } from '../../modules/channels/whatsapp/whatsapp.adapter'

const router = Router()
const whatsappAdapter = new WhatsAppAdapter()

// WhatsApp
router.get('/whatsapp', verifyWebhook)
router.post('/whatsapp', (req, res) => {
  receiveMessage(req, res, async (msg) => {
    if (!msg) return
    const reply = await conversationService.handle(msg)
    await whatsappAdapter.sendMessage(reply)
  })
})

// Instagram — estrutura idêntica, adapter diferente (implementar a seguir)
// router.get('/instagram', verifyWebhook)
// router.post('/instagram', ...)

export default router
