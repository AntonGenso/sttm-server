-- ============================================================================
-- 016_user_consents.sql
--
-- Согласия с документами пилотной программы Mission Moon:
--   'rules'   — Правила участия в пилотной программе;
--   'privacy' — Политика конфиденциальности и согласие на обработку ПДн.
--
-- Это журнал, а не флаг в `users`: по каждому пользователю нужно знать дату и
-- время подтверждения, а при новой редакции документа (новая `version`)
-- согласие запрашивается заново — старая запись при этом остаётся как
-- история. Текущие версии заданы в services/consentService.js.
--
-- ip / user_agent — чтобы факт согласия можно было подтвердить (п. 7.4
-- Политики: «в форме, позволяющей подтвердить факт его предоставления»).
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_consents (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  -- users.id — INT (см. FK в 001_game_tables.sql), тип обязан совпадать.
  user_id     INT NOT NULL,
  document    ENUM('rules', 'privacy') NOT NULL,
  version     VARCHAR(32) NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip          VARCHAR(45) NULL,
  user_agent  VARCHAR(512) NULL,
  -- Повторное подтверждение той же редакции ничего не добавляет.
  UNIQUE KEY uq_user_consent (user_id, document, version),
  CONSTRAINT fk_user_consents_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
