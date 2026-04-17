import { pool } from '../../config/database'
import { logger } from '../../shared/utils/logger'
import { NotFoundError } from '../../shared/errors/app.error'
import type { ClientContext } from '../ai/orchestrator'

interface ClientRow {
  id: string
  name: string
  system_prompt: string | null
}

interface CatalogRow {
  name: string
  description: string | null
  price: string | null
  currency: string
  metadata: string | Record<string, unknown> | null
}

function formatCatalogItem(row: CatalogRow): string {
  let meta: Record<string, unknown> = {}
  if (row.metadata) {
    try {
      meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>)
    } catch {
      // metadata inválido — ignora e usa apenas os campos base
    }
  }

  const parts: string[] = []
  if (meta.tipologia) parts.push(String(meta.tipologia))
  if (meta.area_m2)   parts.push(`${meta.area_m2}m²`)
  if (meta.freguesia) parts.push(String(meta.freguesia))
  if (meta.garagem)   parts.push('garagem')
  if (meta.tipo)      parts.push(String(meta.tipo))
  if (row.price)      parts.push(`€${Number(row.price).toLocaleString('pt-PT')}`)

  const summary = parts.length > 0 ? parts.join(' · ') : ''
  const desc    = row.description ? `\n${row.description}` : ''

  return `**${row.name}**${summary ? `\n${summary}` : ''}${desc}`.trim()
}

export const clientService = {
  /**
   * Carrega o contexto completo do cliente a partir do phone_number_id da Meta.
   * Lança NotFoundError se nenhum cliente activo tiver esse número configurado.
   */
  async getClientContext(phoneNumberId: string): Promise<ClientContext> {
    const [clients] = await pool.execute<any[]>(
      `SELECT id, name, system_prompt
       FROM clients
       WHERE whatsapp_phone_id = ?
         AND status != 'suspended'
       LIMIT 1`,
      [phoneNumberId],
    )

    if (clients.length === 0) {
      logger.warn({ phoneNumberId }, 'No active client found for phone_number_id')
      throw new NotFoundError(`Client with whatsapp_phone_id "${phoneNumberId}"`)
    }

    const client = clients[0] as ClientRow

    const [items] = await pool.execute<any[]>(
      `SELECT name, description, price, currency, metadata
       FROM catalog_items
       WHERE client_id = ? AND available = 1
       LIMIT 20`,
      [client.id],
    )

    const catalogChunks = (items as CatalogRow[]).map(formatCatalogItem)

    logger.debug(
      { clientId: client.id, catalogCount: catalogChunks.length },
      'Client context loaded',
    )

    return {
      clientId: client.id,
      businessName: client.name,
      systemPromptOverride: client.system_prompt ?? undefined,
      catalogChunks,
    }
  },
}
