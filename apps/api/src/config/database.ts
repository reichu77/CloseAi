import mysql from 'mysql2/promise'
import { config } from './index'

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

export async function checkDbConnection(): Promise<void> {
  const conn = await pool.getConnection()
  await conn.ping()
  conn.release()
}
