const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

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

    CREATE TABLE IF NOT EXISTS email_groups (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(100) NOT NULL,
      description VARCHAR(255),
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS email_group_members (
      id          SERIAL PRIMARY KEY,
      group_id    INTEGER REFERENCES email_groups(id) ON DELETE CASCADE,
      email       VARCHAR(100) NOT NULL,
      name        VARCHAR(100),
      added_at    TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sender_groups (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(100) NOT NULL,
      description VARCHAR(255),
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sender_accounts (
      id          SERIAL PRIMARY KEY,
      group_id    INTEGER REFERENCES sender_groups(id) ON DELETE CASCADE,
      host        VARCHAR(100) NOT NULL,
      port        INTEGER DEFAULT 587,
      username    VARCHAR(100) NOT NULL,
      password    VARCHAR(255) NOT NULL,
      from_name   VARCHAR(100),
      added_at    TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content_groups (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(100) NOT NULL,
      description VARCHAR(255),
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content_variations (
      id          SERIAL PRIMARY KEY,
      group_id    INTEGER REFERENCES content_groups(id) ON DELETE CASCADE,
      subject     TEXT NOT NULL,
      body        TEXT NOT NULL,
      is_html     BOOLEAN DEFAULT FALSE,
      sort_order  INTEGER DEFAULT 0,
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("✅ Database tables ready");
}

module.exports = { pool, initDB };
