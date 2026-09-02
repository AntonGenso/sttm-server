-- ============================================================================
-- 008_mission_opens_at.sql
--
-- Дата открытия миссии. До неё карточка миссии показывается ученику закрытой:
-- обложка и награда видны, но зайти внутрь нельзя. NULL — миссия открыта сразу
-- (так остаются все существующие миссии).
--
-- Хранится в UTC. Админка вводит и показывает время в часовом поясе
-- Азия/Ташкент (UTC+5) и конвертирует его на своей стороне; API отдаёт колонку
-- строкой ISO 8601 с суффиксом Z, чтобы результат не зависел ни от таймзоны
-- MySQL, ни от таймзоны Node.
--
-- Идемпотентно: колонка добавляется, только если её ещё нет.
-- ============================================================================

SET @add_opens_at := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'missions'
      AND COLUMN_NAME = 'opens_at') > 0,
  'SELECT 1',
  'ALTER TABLE missions
     ADD COLUMN opens_at DATETIME NULL DEFAULT NULL AFTER is_active'
);
PREPARE stmt FROM @add_opens_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
