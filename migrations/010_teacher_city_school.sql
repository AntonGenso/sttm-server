-- ============================================================================
-- 010_teacher_city_school.sql
--
-- Город и школа переезжают с класса на учителя.
--
-- Раньше город и школа вводились заново при каждом создании класса, и справочник
-- рос от опечаток. Теперь:
--   users.city_id   — город учителя, строго из справочника `cities`;
--   users.school_id — его школа в этом городе;
--   класс создаётся уже без города и школы — школа берётся из профиля
--   (её можно переопределить на другую существующую школу).
--
-- Оба поля NULL-евые: регистрация проходит и без них, но создать класс, пока
-- они не заполнены, нельзя — учитель дозаполняет профиль в приложении.
--
-- `schools.is_verified` — школу по-прежнему может завести учитель, но такая
-- строка попадает к админу на проверку (переименовать / объединить с дублем /
-- подтвердить). Все существующие школы заведены учителями, поэтому остаются
-- неподтверждёнными.
--
-- `cities.name_normalized` — ключ, по которому админ не заведёт «Ташкент» и
-- «г. Ташкент» как два города. Заполняется скриптом `npm run fix:dictionaries`
-- (нормализация живёт в JS, вместе с той, что применяется к школам).
--
-- Идемпотентно: каждая колонка и каждый индекс добавляются, только если их ещё
-- нет. Хранимые процедуры и DELIMITER не используются намеренно — DELIMITER
-- понимает только клиент `mysql`, а миграции здесь накатываются чем придётся.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Унаследованные строки с `created_at = '0000-00-00'` (одна такая есть в users)
-- под NO_ZERO_DATE роняют любую перестройку таблицы — а добавление внешнего
-- ключа именно её и делает. Режим ослабляется только на эту сессию и только
-- по датам: чинить чужие строки миграция не вправе, а спотыкаться о них
-- каждый раз при добавлении колонки — тем более.
-- ----------------------------------------------------------------------------
SET @old_sql_mode := @@SESSION.sql_mode;
SET SESSION sql_mode = REPLACE(REPLACE(@@SESSION.sql_mode, 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '');

-- ----------------------------------------------------------------------------
-- Профиль учителя: город и школа.
--
-- `cities.id` и `schools.id` — INT UNSIGNED, поэтому и колонки здесь такие же:
-- внешний ключ между знаковым и беззнаковым INT MySQL не создаёт.
--
-- ON DELETE SET NULL, а не CASCADE: удаление города из справочника не должно
-- уносить с собой аккаунты — учитель просто снова окажется без профиля и
-- выберет город заново.
-- ----------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'city_id') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN city_id INT UNSIGNED NULL DEFAULT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'school_id') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN school_id INT UNSIGNED NULL DEFAULT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND CONSTRAINT_NAME = 'fk_users_city') > 0,
  'SELECT 1',
  'ALTER TABLE users
     ADD CONSTRAINT fk_users_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND CONSTRAINT_NAME = 'fk_users_school') > 0,
  'SELECT 1',
  'ALTER TABLE users
     ADD CONSTRAINT fk_users_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- Модерация школ. Существующие школы заведены учителями — оставляем их
-- неподтверждёнными, это и есть первая очередь на проверку.
-- ----------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools' AND COLUMN_NAME = 'is_verified') > 0,
  'SELECT 1',
  'ALTER TABLE schools ADD COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools'
      AND INDEX_NAME = 'idx_schools_verified') > 0,
  'SELECT 1',
  'ALTER TABLE schools ADD INDEX idx_schools_verified (is_verified)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- Ключ дедупликации городов. Колонка NULL-евая, поэтому уникальный индекс можно
-- завести до заполнения: одинаковыми NULL-ы MySQL не считает.
-- ----------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'name_normalized') > 0,
  'SELECT 1',
  'ALTER TABLE cities ADD COLUMN name_normalized VARCHAR(100) NULL DEFAULT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cities'
      AND INDEX_NAME = 'uq_cities_normalized') > 0,
  'SELECT 1',
  'ALTER TABLE cities ADD UNIQUE KEY uq_cities_normalized (name_normalized)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- Уникальность класса: добавляем в ключ учителя.
--
-- Индекс был (school_id, grade, letter, alphabet) — без учителя. Пока каждый
-- учитель вписывал название школы по-своему, он попадал в собственную строку
-- `schools`, и коллизия почти не случалась. Теперь школа выбирается из списка,
-- и два учителя одной школы гарантированно упрутся друг в друга на первом же
-- 5А — при том что это два разных класса: у каждого свой код приглашения, свой
-- состав и свой лидерборд.
--
-- Расширение ключа не может конфликтовать с данными: оно только ослабляет
-- ограничение.
-- ----------------------------------------------------------------------------
SET @has_index := (SELECT COUNT(*) FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes'
                      AND INDEX_NAME = 'uq_classes_unique');
SET @has_teacher := (SELECT COUNT(*) FROM information_schema.STATISTICS
                      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes'
                        AND INDEX_NAME = 'uq_classes_unique'
                        AND COLUMN_NAME = 'teacher_id');

SET @sql := IF(@has_index > 0 AND @has_teacher = 0,
  'ALTER TABLE classes
     DROP INDEX uq_classes_unique,
     ADD UNIQUE KEY uq_classes_unique (school_id, teacher_id, grade, letter, alphabet)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- Бэкфилл профиля: у кого уже есть классы — берём школу последнего созданного.
-- Учителя без классов остаются с NULL и выберут город и школу сами.
-- ----------------------------------------------------------------------------
UPDATE users u
  JOIN (
    SELECT c.teacher_id, c.school_id, s.city_id
      FROM classes c
      JOIN schools s ON s.id = c.school_id
      JOIN (SELECT teacher_id, MAX(id) AS last_id
              FROM classes
             GROUP BY teacher_id) latest
        ON latest.teacher_id = c.teacher_id
       AND latest.last_id = c.id
  ) t ON t.teacher_id = u.id
   SET u.city_id = t.city_id,
       u.school_id = t.school_id
 WHERE u.city_id IS NULL
   AND u.school_id IS NULL;

SET SESSION sql_mode = @old_sql_mode;
