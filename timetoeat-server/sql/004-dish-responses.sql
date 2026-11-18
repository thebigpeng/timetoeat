-- 点菜状态迁移可重复执行；历史点菜按已接受处理，保留升级前的催饭能力。
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='messages' AND column_name='order_status')=0,
  'ALTER TABLE messages ADD COLUMN order_status ENUM(''pending'',''accepted'',''rejected'') NULL AFTER dish_emoji',
  'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='messages' AND column_name='reject_reason')=0,
  'ALTER TABLE messages ADD COLUMN reject_reason VARCHAR(100) NOT NULL DEFAULT '''' AFTER order_status',
  'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

UPDATE messages SET order_status='accepted' WHERE type='dish' AND order_status IS NULL;
