-- ============================================================================
-- 011_mission_test_link.sql
--
-- Явная связь «миссия → её тест». До сих пор её не было: у missions и tests
-- были собственные независимые `level`, и совпадение номеров держалось на
-- договорённости, которую админка ничем не подкрепляла — номер миссии и номер
-- теста правятся в разных формах и могли разъехаться молча.
--
-- Отчёт по пилоту считает «сколько учеников класса завершили тест по миссии N»,
-- поэтому связь должна быть данными, а не соглашением.
--
-- test_id NULL — у миссии теста нет (так у скрытой «Galaxy», level 11).
-- UNIQUE: один тест принадлежит максимум одной миссии, иначе его завершения
-- посчитались бы дважды. NULL под уникальным ключом в MySQL не конфликтуют.
--
-- Идемпотентно: колонка, ключ и внешний ключ добавляются, только если их нет.
-- ============================================================================

-- ── missions.test_id ────────────────────────────────────────────────────────
SET @add_test_id := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'missions' AND COLUMN_NAME = 'test_id') > 0,
  'SELECT 1',
  'ALTER TABLE missions ADD COLUMN test_id INT NULL DEFAULT NULL AFTER level'
);
PREPARE stmt FROM @add_test_id; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Бэкфилл по совпадению level ─────────────────────────────────────────────
-- Единственный источник, который у нас есть: исторически тест N относился к
-- миссии N. Соединяем только там, где номер миссии не задвоен, — иначе две
-- миссии претендовали бы на один тест и уникальный ключ ниже не встал бы.
-- Всё, что осталось с NULL, связывается руками в админке.
UPDATE missions m
  JOIN tests t ON t.level = m.level
  JOIN (SELECT level FROM missions GROUP BY level HAVING COUNT(*) = 1) uniq
    ON uniq.level = m.level
   SET m.test_id = t.id
 WHERE m.test_id IS NULL;

-- ── Уникальность ────────────────────────────────────────────────────────────
SET @add_test_uq := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'missions' AND INDEX_NAME = 'uq_missions_test') > 0,
  'SELECT 1',
  'ALTER TABLE missions ADD UNIQUE KEY uq_missions_test (test_id)'
);
PREPARE stmt FROM @add_test_uq; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Внешний ключ ────────────────────────────────────────────────────────────
-- ON DELETE SET NULL: удаление теста не должно уносить миссию — она остаётся
-- со своими материалами, просто без теста.
SET @add_test_fk := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'missions' AND CONSTRAINT_NAME = 'fk_missions_test') > 0,
  'SELECT 1',
  'ALTER TABLE missions
     ADD CONSTRAINT fk_missions_test FOREIGN KEY (test_id) REFERENCES tests(id)
       ON DELETE SET NULL'
);
PREPARE stmt FROM @add_test_fk; EXECUTE stmt; DEALLOCATE PREPARE stmt;
