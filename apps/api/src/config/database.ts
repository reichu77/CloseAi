import mysql from 'mysql2/promise'
import { config } from './index'
import { logger } from '../shared/utils/logger'

export const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
})

// Tenta ligar ao MySQL várias vezes antes de desistir.
// Necessário porque o MySQL demora a inicializar (especialmente na primeira
// vez que corre o init.sql), podendo arrancar mais devagar que a API.
export async function checkDbConnection(retries = 10, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await pool.getConnection()
      await conn.ping()
      conn.release()
      return
    } catch (err: any) {
      if (attempt === retries) throw err
      logger.warn(
        { attempt, retries, error: err.message },
        `MySQL not ready yet, retrying in ${delayMs / 1000}s...`,
      )
      await new Promise((res) => setTimeout(res, delayMs))
    }
  }
}
