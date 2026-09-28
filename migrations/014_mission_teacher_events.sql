-- ============================================================================
-- 014_mission_teacher_events.sql
--
-- К открытию презентации добавляется второе событие учителя — «начал урок»
-- (кнопка «Начать урок» на карточке миссии). Оба отвечают на один вопрос
-- «когда учитель приступил к миссии», поэтому живут в одной таблице с
-- различителем `kind`, а не в двух похожих.
--
-- `guide`  — открыл презентацию (может случиться и накануне, при подготовке);
-- `lesson` — нажал «Начать урок» (прямой сигнал начала урока).
--
-- Таблица переименовывается: имя mission_guide_opens после появления второго
-- вида событий врёт. На момент миграции она пуста (трекинг ещё не на проде),
-- так что переименование ничего не стоит.
--
-- Класс по-прежнему не спрашивается: кнопку жмут в списке миссий, где класс не
-- выбран. Колонка class_id остаётся под будущее уточнение.
--
-- Идемпотентно: переименование и колонка делаются, только если ещё не сделаны.
-- ============================================================================

-- ── Переименование ──────────────────────────────────────────────────────────
SET @rename := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mission_guide_opens') > 0
  AND
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mission_teacher_events') = 0,
  'RENAME TABLE mission_guide_opens TO mission_teacher_events',
  'SELECT 1'
);
PREPARE stmt FROM @rename; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Таблицы могло не быть вовсе (свежая база, 013 накатывается следом) — тогда
-- создаём сразу в целевом виде.
CREATE TABLE IF NOT EXISTS mission_teacher_events (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  mission_id INT NOT NULL,
  kind       ENUM('guide','lesson') NOT NULL DEFAULT 'guide',
  class_id   INT UNSIGNED NULL DEFAULT NULL,
  locale     ENUM('ru','uz') NULL DEFAULT NULL,
  opened_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mte_user_mission (user_id, mission_id, kind, opened_at),
  KEY idx_mte_mission (mission_id, opened_at),
  CONSTRAINT fk_mte_user
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_mte_mission
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  CONSTRAINT fk_mte_class
    FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── kind ────────────────────────────────────────────────────────────────────
-- Существующие строки (если они всё же есть) — открытия презентации, поэтому
-- дефолт 'guide' их и описывает.
SET @add_kind := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mission_teacher_events' AND COLUMN_NAME = 'kind') > 0,
  'SELECT 1',
  'ALTER TABLE mission_teacher_events
     ADD COLUMN kind ENUM(''guide'',''lesson'') NOT NULL DEFAULT ''guide'' AFTER mission_id'
);
PREPARE stmt FROM @add_kind; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── locale становится необязательной ────────────────────────────────────────
-- У «начал урок» языка нет: учитель ещё ничего не открыл.
SET @relax_locale := IF(
  (SELECT IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mission_teacher_events' AND COLUMN_NAME = 'locale') = 'NO',
  'ALTER TABLE mission_teacher_events MODIFY COLUMN locale ENUM(''ru'',''uz'') NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @relax_locale; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Индекс под выборку «первое событие вида X» ──────────────────────────────
SET @add_idx := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mission_teacher_events'
      AND INDEX_NAME = 'idx_mte_user_mission_kind') > 0,
  'SELECT 1',
  'ALTER TABLE mission_teacher_events
     ADD KEY idx_mte_user_mission_kind (user_id, mission_id, kind, opened_at)'
);
PREPARE stmt FROM @add_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
