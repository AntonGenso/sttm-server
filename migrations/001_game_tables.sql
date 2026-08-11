-- ============================================================================
-- 001_game_tables.sql
-- step-to-the-moon: перенос данных игрока из Firebase в MySQL.
--
-- Опирается на уже существующие таблицы:
--   users, roles, user_roles, classes, class_students, missions
--
-- Добавляет:
--   game_profiles     — игровой профиль студента (скин + тоталы лидерборда)
--   tests             — каталог тестов (в missions тестов нет)
--   student_missions  — прогресс студента по миссиям (FK -> missions.id)
--   student_tests     — прогресс студента по тестам   (FK -> tests.id)
--   game_attempts     — лог каждой попытки (история "сколько раз проходил")
--
-- Идемпотентно: все CREATE идут с IF NOT EXISTS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Игровой профиль студента.
-- Одна строка на пользователя. Скин и денормализованные суммы для лидерборда
-- (как leaderboard.{stars,score,total} в Firebase).
--   stars = сумма best_score по миссиям
--   score = сумма best_score по тестам
--   total = stars + score  (по нему сортируется лидерборд)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_profiles (
  user_id    INT PRIMARY KEY,
  head_id    INT NOT NULL DEFAULT 0,
  suit_id    INT NOT NULL DEFAULT 0,
  stars      INT NOT NULL DEFAULT 0,
  score      INT NOT NULL DEFAULT 0,
  total      INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gp_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_gp_total (total)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- Каталог тестов. В таблице missions тестов нет, поэтому заводим отдельный
-- справочник, симметричный missions. Прогресс студентов ссылается на tests.id.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tests (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  label          VARCHAR(100) NULL,
  xp             INT NOT NULL DEFAULT 0,
  question_count INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- Прогресс студента по миссиям. Одна строка = (студент, миссия).
--   status  : open = не начата, in_progress = начата, done = пройдена
--   attempts: сколько раз запускал миссию (инкремент при каждом старте)
--   best_score: лучший результат (compare-and-keep-higher)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_missions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  mission_id   INT NOT NULL,
  status       ENUM('open','in_progress','done') NOT NULL DEFAULT 'open',
  best_score   INT NOT NULL DEFAULT 0,
  attempts     INT NOT NULL DEFAULT 0,
  started_at   TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_mission (user_id, mission_id),
  KEY idx_sm_mission (mission_id),
  CONSTRAINT fk_sm_user
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_sm_mission
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- Прогресс студента по тестам. Одна строка = (студент, тест).
--   attempts: сколько раз перепроходил тест.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_tests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  test_id      INT NOT NULL,
  status       ENUM('open','in_progress','done') NOT NULL DEFAULT 'open',
  best_score   INT NOT NULL DEFAULT 0,
  attempts     INT NOT NULL DEFAULT 0,
  started_at   TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_test (user_id, test_id),
  KEY idx_st_test (test_id),
  CONSTRAINT fk_st_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_st_test
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- Лог попыток (append-only). Даёт полную историю: когда играл, с каким счётом.
-- Счётчики attempts в student_missions/student_tests можно при желании считать
-- отсюда (COUNT(*)), но денормализованный счётчик оставлен для скорости профиля.
--   kind    : mission | test
--   item_id : missions.id либо tests.id (в зависимости от kind)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_attempts (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  kind        ENUM('mission','test') NOT NULL,
  item_id     INT NOT NULL,
  score       INT NOT NULL DEFAULT 0,
  started_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  KEY idx_ga_user (user_id),
  KEY idx_ga_lookup (user_id, kind, item_id),
  CONSTRAINT fk_ga_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
