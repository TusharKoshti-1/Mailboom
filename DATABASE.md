# MailBlast — Database Schema

## Overview
PostgreSQL database with 4 tables.

---

## Tables

### 1. `users`
Stores registered user accounts.

| Column     | Type         | Description                        |
|------------|--------------|------------------------------------|
| id         | SERIAL PK    | Auto-increment user ID             |
| name       | VARCHAR(100) | Full name                          |
| email      | VARCHAR(100) | Unique email address (login)       |
| password   | VARCHAR(255) | Bcrypt hashed password             |
| plan       | VARCHAR(20)  | Subscription plan (default: free)  |
| created_at | TIMESTAMP    | Account creation time              |

---

### 2. `smtp_settings`
Each user's saved SMTP configuration.

| Column     | Type         | Description                        |
|------------|--------------|------------------------------------|
| id         | SERIAL PK    | Auto-increment ID                  |
| user_id    | INTEGER FK   | References users.id (CASCADE)      |
| host       | VARCHAR(100) | SMTP host (e.g. smtp.hostinger.com)|
| port       | INTEGER      | SMTP port (default: 587)           |
| username   | VARCHAR(100) | SMTP username / email address      |
| password   | VARCHAR(255) | SMTP password (plain text)         |
| from_name  | VARCHAR(100) | Display name for sent emails       |
| updated_at | TIMESTAMP    | Last updated time                  |

---

### 3. `email_groups`
Named groups of recipient emails per user.

| Column      | Type         | Description                        |
|-------------|--------------|------------------------------------|
| id          | SERIAL PK    | Auto-increment group ID            |
| user_id     | INTEGER FK   | References users.id (CASCADE)      |
| name        | VARCHAR(100) | Group name (e.g. Newsletter List)  |
| description | VARCHAR(255) | Optional description               |
| created_at  | TIMESTAMP    | Group creation time                |

---

### 4. `email_group_members`
Individual email addresses inside a group.

| Column   | Type         | Description                        |
|----------|--------------|------------------------------------|
| id       | SERIAL PK    | Auto-increment member ID           |
| group_id | INTEGER FK   | References email_groups.id (CASCADE)|
| email    | VARCHAR(100) | Email address of the member        |
| name     | VARCHAR(100) | Optional display name              |
| added_at | TIMESTAMP    | When this member was added         |

---

## Relationships

```
users
  └── smtp_settings     (one-to-one per user)
  └── email_groups      (one-to-many)
        └── email_group_members  (one-to-many)
```

---

## Key Rules
- Deleting a user → cascades and deletes their smtp_settings, email_groups, and all group members
- Deleting an email_group → cascades and deletes all its members
- Duplicate emails within a group are prevented in the API layer
- SMTP password stored as plain text (encrypted transport via TLS)

---

## Useful Queries

### See all users
```sql
SELECT id, name, email, plan, created_at FROM users;
```

### See all groups with member count
```sql
SELECT g.id, g.name, g.description, COUNT(m.id) as members
FROM email_groups g
LEFT JOIN email_group_members m ON m.group_id = g.id
GROUP BY g.id
ORDER BY g.created_at DESC;
```

### See all members of a group
```sql
SELECT * FROM email_group_members WHERE group_id = 1;
```

### See SMTP settings for a user
```sql
SELECT s.*, u.email as user_email
FROM smtp_settings s
JOIN users u ON u.id = s.user_id
WHERE s.user_id = 1;
```
