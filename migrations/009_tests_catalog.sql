-- ============================================================================
-- 009_tests_catalog.sql
--
-- Тесты переезжают в базу и заводятся в админке — до сих пор в `tests` лежал
-- только пустой каталог (id/название/xp), а сами вопросы были захардкожены во
-- фронтенде (messages/*.json + testData.ts).
--
-- Добавляет в tests:
--   level      — номер теста («Тест 07»); он же задаёт порядок карточек.
--                УНИКАЛЕН: два теста не могут занимать один номер.
--   is_active  — «скрыт»/«виден», как у миссий (006).
--   opens_at   — дата открытия в UTC, как у миссий (008). NULL — открыт сразу.
--   cover_key  — обложка в публичном бакете MinIO.
--
-- Создаёт test_questions: по вопросу на строку, ровно четыре варианта A–D и
-- один правильный — ровно та форма, которую уже умеет рендерить игра. Русский
-- текст обязателен, узбекский нет: пустой uz означает «показывать ru», как это
-- уже устроено у фактов миссии (007).
--
-- Идемпотентно: колонки, индекс и таблица добавляются, только если их ещё нет.
-- ============================================================================

-- ── tests.level ─────────────────────────────────────────────────────────────
SET @add_level := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'level') > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN level INT NOT NULL DEFAULT 0 AFTER xp'
);
PREPARE stmt FROM @add_level; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Существующие тесты нумеруются по порядку создания — иначе они все остались бы
-- с level = 0 и уникальный индекс ниже не встал бы. Трогает только строки с
-- level = 0, поэтому повторный запуск безопасен.
UPDATE tests t
  JOIN (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM tests
  ) ordered ON ordered.id = t.id
   SET t.level = ordered.rn
 WHERE t.level = 0;

-- Уникальность номера. Ставится ПОСЛЕ проставления level, иначе индекс не
-- создастся: до этого у всех строк был бы 0.
SET @add_level_uq := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tests' AND INDEX_NAME = 'uq_tests_level') > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD UNIQUE KEY uq_tests_level (level)'
);
PREPARE stmt FROM @add_level_uq; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── tests.is_active ─────────────────────────────────────────────────────────
SET @add_is_active := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'is_active') > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1'
);
PREPARE stmt FROM @add_is_active; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── tests.opens_at ──────────────────────────────────────────────────────────
SET @add_opens_at := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'opens_at') > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN opens_at DATETIME NULL DEFAULT NULL'
);
PREPARE stmt FROM @add_opens_at; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── tests.cover_key ─────────────────────────────────────────────────────────
SET @add_cover := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'cover_key') > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN cover_key VARCHAR(255) DEFAULT NULL'
);
PREPARE stmt FROM @add_cover; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── test_questions ──────────────────────────────────────────────────────────
-- Четыре варианта лежат колонками, а не отдельной таблицей: их всегда ровно
-- четыре (A–D) — столько рендерит игра, — и плоская строка читается и пишется
-- одним запросом.
CREATE TABLE IF NOT EXISTS test_questions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  test_id        INT NOT NULL,
  -- Порядок вопросов внутри теста; задаётся формой админки.
  position       INT NOT NULL DEFAULT 0,
  text_ru        TEXT NOT NULL,
  text_uz        TEXT DEFAULT NULL,
  option_a_ru    VARCHAR(255) NOT NULL,
  option_b_ru    VARCHAR(255) NOT NULL,
  option_c_ru    VARCHAR(255) NOT NULL,
  option_d_ru    VARCHAR(255) NOT NULL,
  option_a_uz    VARCHAR(255) DEFAULT NULL,
  option_b_uz    VARCHAR(255) DEFAULT NULL,
  option_c_uz    VARCHAR(255) DEFAULT NULL,
  option_d_uz    VARCHAR(255) DEFAULT NULL,
  correct_option ENUM('A','B','C','D') NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tq_test (test_id, position),
  CONSTRAINT fk_tq_test
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
