import { pool } from '../../config/database'
import { logger } from '../../shared/utils/logger'

// RAG service para o MVP.
//
// Estratégia simples (sem vector DB externo):
//   1. Guarda embedding_text em cada catalog_item no MySQL
//   2. Para retrieval, usa full-text search do MySQL (bom o suficiente para MVP)
//   3. Quando precisares de semântica real, troca por Qdrant ou similar
//
// O orchestrator chama getRelevantChunks() antes de montar o prompt.

export const ragService = {
  async getRelevantChunks(clientId: string, query: string, limit = 5): Promise<string[]> {
    try {
      // Full-text search básico — funciona bem para catálogos pequenos/médios
      const [rows] = await pool.execute<any[]>(
        `SELECT embedding_text, name, description, price, currency, metadata
         FROM catalog_items
         WHERE client_id = ?
           AND available = 1
           AND (
             MATCH(name, description) AGAINST(? IN BOOLEAN MODE)
             OR name LIKE ?
           )
         LIMIT ?`,
        [clientId, query + '*', `%${query}%`, limit],
      )

      if (rows.length === 0) {
        // Fallback: devolve todos os items do catálogo (até 20)
        const [all] = await pool.execute<any[]>(
          `SELECT name, description, price, currency, metadata
           FROM catalog_items
           WHERE client_id = ? AND available = 1
           LIMIT 20`,
          [clientId],
        )
        return all.map(formatChunk)
      }

      return rows.map(formatChunk)
    } catch (err) {
      logger.error({ err, clientId }, 'RAG query failed')
      return []
    }
  },

  // Indexa / actualiza o full-text index quando um item é criado ou editado
  async indexItem(itemId: string): Promise<void> {
    // MySQL cria o FULLTEXT index automaticamente com ALTER TABLE
    // Adiciona aqui geração de embeddings reais quando precisares de semântica
    logger.debug({ itemId }, 'RAG: item indexed (full-text)')
  },
}

function formatChunk(row: any): string {
  let meta: Record<string, any> = {}
  if (row.metadata) {
    try {
      meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    } catch {
      // metadata inválido — ignora e usa campos base
    }
  }

  const parts: string[] = []
  if (meta.tipologia) parts.push(meta.tipologia)
  if (meta.area_m2)   parts.push(`${meta.area_m2}m²`)
  if (meta.freguesia) parts.push(meta.freguesia)
  if (meta.garagem)   parts.push('garagem')
  if (meta.tipo)      parts.push(meta.tipo)
  if (row.price)      parts.push(`€${Number(row.price).toLocaleString('pt-PT')}`)

  const summary = parts.length > 0 ? parts.join(' · ') : ''
  const desc    = row.description ? `\n${row.description}` : ''

  return `**${row.name}**${summary ? `\n${summary}` : ''}${desc}`.trim()
}
