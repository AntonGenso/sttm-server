-- ============================================================================
-- 002_mission_video.sql
-- Видео миссии перестаёт быть внешней ссылкой: файл заливается в MinIO
-- (публичный бакет, префикс `missions/{id}/video/`), а в БД хранится путь к
-- объекту — так же, как это уже сделано для обложки и документов.
--
-- Добавляет в mission_info:
--   video_key   — ключ объекта в MinIO (ascii, как cover_key)
--   video_name  — оригинальное имя файла, для показа в админке
--
-- Колонка video_link остаётся ради старых данных, но кодом больше не пишется
-- и не читается.
--
-- Идемпотентно: колонки добавляются только если их ещё нет.
-- ============================================================================

SET @add_key := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mission_info'
      AND COLUMN_NAME = 'video_key') > 0,
  'SELECT 1',
  'ALTER TABLE mission_info
     ADD COLUMN video_key VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin
     DEFAULT NULL AFTER video_link'
);
PREPARE stmt FROM @add_key;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_name := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mission_info'
      AND COLUMN_NAME = 'video_name') > 0,
  'SELECT 1',
  'ALTER TABLE mission_info
     ADD COLUMN video_name VARCHAR(255) DEFAULT NULL AFTER video_key'
);
PREPARE stmt FROM @add_name;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
