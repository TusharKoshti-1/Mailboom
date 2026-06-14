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

    -- Subject Groups: a pool of subject lines, picked at random per recipient
    CREATE TABLE IF NOT EXISTS subject_groups (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(100) NOT NULL,
      description VARCHAR(255),
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subject_items (
      id          SERIAL PRIMARY KEY,
      group_id    INTEGER REFERENCES subject_groups(id) ON DELETE CASCADE,
      subject     TEXT NOT NULL,
      sort_order  INTEGER DEFAULT 0,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    -- Body Groups: a pool of message bodies, picked at random per recipient
    CREATE TABLE IF NOT EXISTS body_groups (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(100) NOT NULL,
      description VARCHAR(255),
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS body_items (
      id          SERIAL PRIMARY KEY,
      group_id    INTEGER REFERENCES body_groups(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      is_html     BOOLEAN DEFAULT FALSE,
      sort_order  INTEGER DEFAULT 0,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    -- Old combined content groups (subject+body paired) are replaced by the
    -- independent subject/body groups above.
    DROP TABLE IF EXISTS content_variations;
    DROP TABLE IF EXISTS content_groups;
  `);
  console.log("✅ Database tables ready");
}

module.exports = { pool, initDB };
