-- ============================================================================
-- 005_refresh_tokens.sql
-- Refresh-токены для короткоживущих access-JWT.
--
-- Access-токен теперь живёт 15 минут; долгую сессию держит refresh-токен.
-- В таблице хранится ТОЛЬКО SHA-256 хэш токена (сам токен — 32 случайных
-- байта — уходит клиенту и в БД не пишется), поэтому утечка таблицы не даёт
-- выпустить access-токен.
--
-- Ротация: на каждый /auth/refresh старая строка помечается revoked_at, а
-- взамен выдаётся новая. Повторное предъявление уже отозванного токена
-- (см. refreshTokenService) считается компрометацией и гасит все сессии юзера.
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  -- users.id — INT (см. FK в 001_game_tables.sql), тип обязан совпадать.
  user_id    INT NOT NULL,
  -- SHA-256 в hex — ровно 64 символа. UNIQUE, т.к. по нему ищем токен.
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- NULL, пока токен жив. Ставится при ротации/логауте/компрометации.
  revoked_at DATETIME NULL,
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_user (user_id),
  CONSTRAINT fk_refresh_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
