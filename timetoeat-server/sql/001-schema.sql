SET NAMES utf8mb4;
CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  identity_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  login_type ENUM('test','wechat') NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(1024) NOT NULL DEFAULT '',
  emoji VARCHAR(32) NOT NULL DEFAULT '😀',
  signature VARCHAR(255) NOT NULL DEFAULT '欢迎来蹭饭',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  INDEX (user_id), INDEX (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE dishes (
  id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  emoji VARCHAR(32) NOT NULL DEFAULT '🍲',
  category_id VARCHAR(32) NOT NULL DEFAULT 'custom',
  price_cents INT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE user_dishes (
  user_id BIGINT UNSIGNED NOT NULL,
  dish_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (user_id, dish_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (dish_id) REFERENCES dishes(id)
) ENGINE=InnoDB;
CREATE TABLE friendships (
  user_low BIGINT UNSIGNED NOT NULL,
  user_high BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_low,user_high), INDEX (user_high),
  CHECK (user_low < user_high),
  FOREIGN KEY (user_low) REFERENCES users(id),
  FOREIGN KEY (user_high) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sender_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  client_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  type ENUM('text','sticker','dish','nudge') NOT NULL,
  content TEXT NOT NULL,
  dish_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  dish_name VARCHAR(100) NOT NULL DEFAULT '',
  dish_emoji VARCHAR(32) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at DATETIME(3) NULL,
  UNIQUE KEY message_retry (sender_id,client_id),
  INDEX chat_sent (sender_id,recipient_id,id),
  INDEX chat_received (recipient_id,sender_id,id),
  INDEX unread (recipient_id,read_at),
  CHECK (sender_id <> recipient_id),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (recipient_id) REFERENCES users(id),
  FOREIGN KEY (dish_id) REFERENCES dishes(id)
) ENGINE=InnoDB;
