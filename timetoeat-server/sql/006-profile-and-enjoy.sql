-- 用户厨师形象、菜菜分与点菜完成状态迁移，可重复执行。
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='gender')=0,
  'ALTER TABLE users ADD COLUMN gender ENUM(''unknown'',''male'',''female'') NOT NULL DEFAULT ''unknown'' AFTER signature',
  'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='caicai_score')=0,
  'ALTER TABLE users ADD COLUMN caicai_score INT UNSIGNED NOT NULL DEFAULT 0 AFTER gender',
  'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='messages' AND column_name='enjoyed_at')=0,
  'ALTER TABLE messages ADD COLUMN enjoyed_at DATETIME(6) NULL AFTER responded_at',
  'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

ALTER TABLE messages MODIFY COLUMN order_status ENUM('pending','accepted','rejected','enjoyed') NULL;
