#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');

async function migrate() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/migrate.js <migration-file>');
    process.exit(1);
  }

  const sql = fs.readFileSync(file, 'utf8');
  const client = new Client({
    connectionString: process.env.POSTGRES_DATABASE_URL
  });

  try {
    await client.connect();
    console.log(`Running migration: ${file}`);
    await client.query(sql);
    console.log('✓ Migration completed');
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
