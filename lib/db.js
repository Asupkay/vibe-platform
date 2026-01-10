/**
 * Database helper - Postgres connection via Neon
 * Used for artifacts and other structured data
 */

import { neon } from '@neondatabase/serverless';

// Postgres connection
let sqlInstance = null;

export function getSQL() {
  if (!sqlInstance && process.env.POSTGRES_URL) {
    sqlInstance = neon(process.env.POSTGRES_URL);
  }
  return sqlInstance;
}

export function isPostgresEnabled() {
  return !!process.env.POSTGRES_URL;
}

// Helper for queries with error handling
export async function query(sql, params = []) {
  const db = getSQL();
  if (!db) {
    throw new Error('Postgres not configured');
  }

  try {
    const result = await db(sql, params);
    return { success: true, rows: result };
  } catch (error) {
    console.error('[DB] Query error:', error.message);
    return { success: false, error: error.message };
  }
}

// Check if database is healthy
export async function healthCheck() {
  if (!isPostgresEnabled()) {
    return { healthy: false, reason: 'Not configured' };
  }

  try {
    const db = getSQL();
    await db`SELECT 1`;
    return { healthy: true };
  } catch (error) {
    return { healthy: false, reason: error.message };
  }
}
