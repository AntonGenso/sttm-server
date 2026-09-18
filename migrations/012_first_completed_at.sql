-- ============================================================================
-- 012_first_completed_at.sql
--
-- Дата ПЕРВОГО завершения миссии и теста.
--
-- `completed_at` для этого не годится: submitItem пишет его через
-- ON DUPLICATE KEY UPDATE, то есть при каждом перепрохождении дата
-- перезаписывается, и в колонке лежит дата последнего раза. Отчёт по пилоту
-- спрашивает «когда в классе впервые завершили тест» — по completed_at ответ
-- уезжал бы вперёд тем сильнее, чем активнее дети перепроходят.
--
-- Лог попыток (game_attempts) восстановить историю не помогает: он заполняется
-- только через startItem, который игра не вызывает, и на момент миграции в нём
-- 2 строки против 106 завершённых тестов.
--
-- Поэтому бэкфилл берёт лучшее из доступного:
--   • MIN(finished_at) из game_attempts, если попытка там есть;
--   • иначе completed_at.
-- Для тестов с attempts > 1 (на момент миграции таких 15) вторая ветка даёт
-- дату ПОЗЖЕ настоящей — первое прохождение не сохранилось нигде и
-- восстановлению не подлежит. Дальше колонка заполняется точно.
--
-- Идемпотентно: колонки добавляются, только если их ещё нет; бэкфилл трогает
-- только строки с NULL.
-- ============================================================================

DROP PROCEDURE IF EXISTS sttm_add_first_completed;

DELIMITER //
CREATE PROCEDURE sttm_add_first_completed(IN tbl VARCHAR(64))
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = tbl
          AND COLUMN_NAME = 'first_completed_at') = 0 THEN
    SET @ddl := CONCAT('ALTER TABLE ', tbl,
      ' ADD COLUMN first_completed_at TIMESTAMP NULL DEFAULT NULL AFTER started_at');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL sttm_add_first_completed('student_tests');
CALL sttm_add_first_completed('student_missions');

DROP PROCEDURE IF EXISTS sttm_add_first_completed;

-- ── Бэкфилл ─────────────────────────────────────────────────────────────────
-- updated_at присваивается сам себе намеренно: без этого ON UPDATE
-- CURRENT_TIMESTAMP переписал бы его на дату миграции всем строкам разом.
UPDATE student_tests st
  LEFT JOIN (
    SELECT user_id, item_id, MIN(finished_at) AS first_at
      FROM game_attempts
     WHERE kind = 'test' AND finished_at IS NOT NULL
     GROUP BY user_id, item_id
  ) ga ON ga.user_id = st.user_id AND ga.item_id = st.test_id
   SET st.first_completed_at = COALESCE(ga.first_at, st.completed_at),
       st.updated_at = st.updated_at
 WHERE st.first_completed_at IS NULL
   AND st.completed_at IS NOT NULL;

UPDATE student_missions sm
  LEFT JOIN (
    SELECT user_id, item_id, MIN(finished_at) AS first_at
      FROM game_attempts
     WHERE kind = 'mission' AND finished_at IS NOT NULL
     GROUP BY user_id, item_id
  ) ga ON ga.user_id = sm.user_id AND ga.item_id = sm.mission_id
   SET sm.first_completed_at = COALESCE(ga.first_at, sm.completed_at),
       sm.updated_at = sm.updated_at
 WHERE sm.first_completed_at IS NULL
   AND sm.completed_at IS NOT NULL;
