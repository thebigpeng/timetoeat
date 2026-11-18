SELECT VERSION() AS mysql_version;
SHOW TABLES;
SELECT id, identity_key, nickname, login_type, created_at, last_login_at FROM users ORDER BY id;
SELECT COUNT(*) AS catalog_dishes FROM dishes WHERE owner_id IS NULL;
SELECT COUNT(*) AS messages FROM messages;
SELECT COUNT(*) AS active_sessions FROM sessions WHERE expires_at > UTC_TIMESTAMP(3);
