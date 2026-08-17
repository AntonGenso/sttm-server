-- ============================================================================
-- 004_mission_bonus_xp.sql
--
-- Миссии больше не делятся на «current»/«bonuse» как отдельные сущности.
-- Теперь у одной миссии есть основные материалы (презентация, конспект, видео)
-- и опциональный БОНУС — «Инструкция для ученика» (document_link_ru/uz, уже
-- существуют) со своей отдельной наградой XP.
--
-- Добавляет в mission_info:
--   bonus_xp — награда за бонусную часть (0 = бонуса нет / без награды)
--
-- Наличие бонуса определяется наличием файлов инструкции (document_link_*).
-- Колонка `missions.type` остаётся ради обратной совместимости, но кодом
-- больше не используется.
--
-- Идемпотентно: колонка добавляется только если её ещё нет.
-- ============================================================================

SET @add_bonus_xp := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mission_info'
      AND COLUMN_NAME = 'bonus_xp') > 0,
  'SELECT 1',
  'ALTER TABLE mission_info
     ADD COLUMN bonus_xp INT NOT NULL DEFAULT 0 AFTER game_link'
);
PREPARE stmt FROM @add_bonus_xp;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
