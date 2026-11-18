-- 旧数据没有准确回复时间，保留 NULL，避免升级将历史会话全部置顶。
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='messages' AND column_name='responded_at')=0,
  'ALTER TABLE messages ADD COLUMN responded_at DATETIME(6) NULL AFTER reject_reason',
  'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;
