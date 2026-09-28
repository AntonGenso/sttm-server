-- ============================================================================
-- 015_legal_consent.sql
--
-- Согласие с правилами участия и политикой конфиденциальности.
--
-- Самих документов ещё нет — это заготовка. Пока в окружении не заданы их
-- адреса и версия (см. src/config/legal.js), приложение согласие не
-- спрашивает и ничего про него не показывает; всё, что здесь заводится,
-- просто лежит пустым.
--
-- Версия, а не голая галочка: документы будут меняться, и тогда согласие
-- придётся собрать заново. Сравнение `terms_version` с текущей версией — это
-- и есть «ознакомлен ли человек с ДЕЙСТВУЮЩЕЙ редакцией».
--
-- Все существующие аккаунты остаются с NULL: они регистрировались до того, как
-- документы появились, и согласия не давали. Именно им приложение покажет
-- модальное окно, без которого дальше ничего сделать нельзя.
--
-- Идемпотентно: колонки добавляются, только если их ещё нет.
-- ============================================================================

SET @add_accepted_at := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users' AND COLUMN_NAME = 'terms_accepted_at') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME NULL DEFAULT NULL'
);
PREPARE stmt FROM @add_accepted_at; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Строка, а не число: версия документа — это «2026-10» или «1.2», и сравнивать
-- её приложение будет как строку, целиком.
SET @add_version := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users' AND COLUMN_NAME = 'terms_version') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN terms_version VARCHAR(20) NULL DEFAULT NULL'
);
PREPARE stmt FROM @add_version; EXECUTE stmt; DEALLOCATE PREPARE stmt;
