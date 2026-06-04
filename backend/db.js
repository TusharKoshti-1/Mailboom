const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Create tables if they don't exist
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      email       VARCHAR(100) UNIQUE NOT NULL,
      password    VARCHAR(255) NOT NULL,
      plan        VARCHAR(20) DEFAULT 'free',
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS smtp_settings (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      host        VARCHAR(100),
      port        INTEGER DEFAULT 587,
      username    VARCHAR(100),
      password    VARCHAR(255),
      from_name   VARCHAR(100),
      updated_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("✅ Database tables ready");
}

module.exports = { pool, initDB };
