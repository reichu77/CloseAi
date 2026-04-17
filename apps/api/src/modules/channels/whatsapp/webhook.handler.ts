import type { Request, Response } from 'express'
import { config } from '../../../config'
import { logger } from '../../../shared/utils/logger'
import { WhatsAppAdapter } from './whatsapp.adapter'

const adapter = new WhatsAppAdapter()

// GET /webhook/whatsapp — Meta verifica o endpoint com um challenge
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified')
    res.status(200).send(challenge)
    return
  }

  res.sendStatus(403)
}

// POST /webhook/whatsapp — recebe mensagens
export async function receiveMessage(
  req: Request,
  res: Response,
  handleMessage: (msg: ReturnType<WhatsAppAdapter['parseIncoming']>) => Promise<void>,
): Promise<void> {
  // Meta espera 200 imediatamente — processamento é async
  res.sendStatus(200)

  const parsed = adapter.parseIncoming(req.body)
  if (!parsed) return

  logger.info({ contactId: parsed.contactId, clientId: parsed.clientId }, 'WhatsApp message received')

  await handleMessage(parsed).catch((err) =>
    logger.error({ err }, 'Error handling WhatsApp message'),
  )
}
