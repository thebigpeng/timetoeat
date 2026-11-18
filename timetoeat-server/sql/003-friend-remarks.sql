-- 备注属于填写者，不属于对方的全局用户资料。兼容已有数据库，可重复执行。
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='friendships' AND column_name='remark_by_low')=0,
  'ALTER TABLE friendships ADD COLUMN remark_by_low VARCHAR(32) NOT NULL DEFAULT ''''',
  'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='friendships' AND column_name='remark_by_high')=0,
  'ALTER TABLE friendships ADD COLUMN remark_by_high VARCHAR(32) NOT NULL DEFAULT ''''',
  'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;
