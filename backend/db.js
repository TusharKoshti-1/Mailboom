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

    -- One row per successfully sent email, with a unique tracking id used by
    -- the tracking pixel. open_count / first_/last_opened_at are denormalized
    -- for fast listing; every individual open is also logged in email_opens.
    CREATE TABLE IF NOT EXISTS sent_emails (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tracking_id     VARCHAR(64) UNIQUE NOT NULL,
      recipient       VARCHAR(255) NOT NULL,
      subject         TEXT,
      from_addr       VARCHAR(255),
      open_count      INTEGER DEFAULT 0,
      first_opened_at TIMESTAMP,
      last_opened_at  TIMESTAMP,
      sent_at         TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS email_opens (
      id            SERIAL PRIMARY KEY,
      sent_email_id INTEGER REFERENCES sent_emails(id) ON DELETE CASCADE,
      opened_at     TIMESTAMP DEFAULT NOW(),
      user_agent    TEXT,
      ip            VARCHAR(64)
    );

    CREATE INDEX IF NOT EXISTS idx_sent_emails_user ON sent_emails(user_id);
    CREATE INDEX IF NOT EXISTS idx_email_opens_sent ON email_opens(sent_email_id);

    -- Background sending campaigns. A campaign is processed by a worker inside
    -- the server process, so it keeps running after the browser is closed and
    -- resumes on server restart. Status: running | paused | completed | stopped.
    CREATE TABLE IF NOT EXISTS campaigns (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name            VARCHAR(160),
      status          VARCHAR(20) DEFAULT 'running',
      total           INTEGER DEFAULT 0,
      sent_count      INTEGER DEFAULT 0,
      failed_count    INTEGER DEFAULT 0,
      subject         TEXT,
      body            TEXT,
      is_html         BOOLEAN DEFAULT FALSE,
      subject_group_id INTEGER,
      body_group_id    INTEGER,
      sender_group_id  INTEGER,
      smtp_host       VARCHAR(100),
      smtp_port       INTEGER,
      smtp_user       VARCHAR(100),
      smtp_pass       VARCHAR(255),
      from_name       VARCHAR(100),
      min_delay       NUMERIC DEFAULT 10,
      max_delay       NUMERIC DEFAULT 20,
      attachments     JSONB DEFAULT '[]',
      base_url        TEXT,
      created_at      TIMESTAMP DEFAULT NOW(),
      finished_at     TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id           SERIAL PRIMARY KEY,
      campaign_id  INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
      email        VARCHAR(255) NOT NULL,
      status       VARCHAR(20) DEFAULT 'pending',
      from_addr    VARCHAR(255),
      subject      TEXT,
      error        TEXT,
      sent_at      TIMESTAMP,
      idx          INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
    CREATE INDEX IF NOT EXISTS idx_camp_recipients ON campaign_recipients(campaign_id, status);
  `);
  console.log("✅ Database tables ready");
}

module.exports = { pool, initDB };
