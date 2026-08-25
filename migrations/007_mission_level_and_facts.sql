-- ============================================================================
-- 007_mission_level_and_facts.sql
--
-- Две вещи, которые раньше жили в захардкоженном каталоге игры и теперь
-- заводятся в админке:
--
--   missions.level  — номер миссии («Миссия 07»). Им же задаётся порядок
--                     карточек в игре. Бонусная карточка наследует level своей
--                     миссии, отдельной строки у неё нет (см. 004).
--   mission_facts   — «Интересные факты» на экране миссии. Текст лежит здесь,
--                     картинка — в публичном бакете MinIO (image_key).
--
-- Узбекский текст факта необязателен: пустой uz означает «показывать ru»,
-- ровно как это уже устроено у видео и документов.
--
-- Идемпотентно: колонка и таблица добавляются, только если их ещё нет.
-- ============================================================================

-- ── missions.level ──────────────────────────────────────────────────────────
SET @add_level := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'missions'
      AND COLUMN_NAME = 'level') > 0,
  'SELECT 1',
  'ALTER TABLE missions
     ADD COLUMN level INT NOT NULL DEFAULT 0 AFTER xp'
);
PREPARE stmt FROM @add_level;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Существующие миссии нумеруются по порядку их создания, чтобы экран не
-- открылся со списком «Миссия 00». Дальше номер правится в админке.
-- Трогает только строки с level = 0, поэтому повторный запуск безопасен.
UPDATE missions m
  JOIN (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM missions
  ) ordered ON ordered.id = m.id
   SET m.level = ordered.rn
 WHERE m.level = 0;

-- ── mission_facts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mission_facts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  mission_id     INT NOT NULL,
  -- Порядок карточек факта внутри миссии; задаётся формой админки.
  position       INT NOT NULL DEFAULT 0,
  title_ru       VARCHAR(255) NOT NULL,
  title_uz       VARCHAR(255) DEFAULT NULL,
  description_ru TEXT NOT NULL,
  description_uz TEXT DEFAULT NULL,
  -- Ключ объекта в публичном бакете; NULL — факт без картинки.
  image_key      VARCHAR(255) DEFAULT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mf_mission (mission_id, position),
  CONSTRAINT fk_mf_mission
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
