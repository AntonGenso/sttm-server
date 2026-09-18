-- ============================================================================
-- 013_mission_guide_opens.sql
--
-- Лог открытий презентации миссии учителем — «когда в классе провели урок».
--
-- Презентация лежит в приватном бакете (mission_info.teacher_guide_ru/uz) и до
-- сих пор отдавалась подписанной ссылкой внутри карточки миссии, после чего
-- браузер уходил за файлом прямо в MinIO. Бэкенд открытия не видел вовсе,
-- поэтому истории до этой миграции не существует и восстановить её неоткуда.
--
-- Append-only: строка на каждое открытие. Отчёт берёт MIN(opened_at) — так
-- «первое открытие» не зависит от того, сколько раз учитель вернулся к файлу.
--
-- class_id пока всегда NULL: презентация открывается на странице миссии, где
-- класс не выбран, а классов у учителя может быть несколько. Колонка заведена
-- сразу, чтобы не мигрировать таблицу, когда открытие научится знать класс.
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mission_guide_opens (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  mission_id INT NOT NULL,
  -- INT UNSIGNED — такой тип у classes.id, иначе внешний ключ не встанет.
  class_id   INT UNSIGNED NULL DEFAULT NULL,
  locale     ENUM('ru','uz') NOT NULL,
  opened_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Отчёт читает «первое открытие по учителю и миссии»; этим же ключом
  -- закрывается выборка по миссии.
  KEY idx_mgo_user_mission (user_id, mission_id, opened_at),
  KEY idx_mgo_mission (mission_id, opened_at),
  CONSTRAINT fk_mgo_user
    FOREIGN KEY (user_id)    REFERENCES users(id)     ON DELETE CASCADE,
  CONSTRAINT fk_mgo_mission
    FOREIGN KEY (mission_id) REFERENCES missions(id)  ON DELETE CASCADE,
  -- Класс удалили — событие остаётся, теряется только его привязка.
  CONSTRAINT fk_mgo_class
    FOREIGN KEY (class_id)   REFERENCES classes(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
