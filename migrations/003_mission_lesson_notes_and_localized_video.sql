-- ============================================================================
-- 003_mission_lesson_notes_and_localized_video.sql
--
-- Раздел материалов миссии делится на три части, каждая на двух языках (ru/uz):
--   • Инструкция для ученика  — уже хранится в document_link_*  (без изменений)
--   • Презентация             — уже хранится в teacher_guide_*  (без изменений)
--   • Конспект урока           — НОВОЕ: приватный бакет, префикс
--                               `missions/{id}/lesson-notes/{ru|uz}/`
--
-- Плюс видео миссии становится двуязычным: публичный бакет, префиксы
--   `missions/{id}/video/ru/` и `missions/{id}/video/uz/`.
-- Старые колонки video_link / video_key / video_name остаются ради уже
-- загруженных данных, но новым кодом не пишутся.
--
-- Добавляет в mission_info:
--   lesson_notes_ru       — ключ объекта конспекта (ru) в MinIO
--   lesson_notes_name_ru  — оригинальное имя файла
--   lesson_notes_uz       — ключ объекта конспекта (uz)
--   lesson_notes_name_uz  — оригинальное имя файла
--   video_key_ru          — ключ видео (ru)
--   video_name_ru         — оригинальное имя видео (ru)
--   video_key_uz          — ключ видео (uz)
--   video_name_uz         — оригинальное имя видео (uz)
--
-- Идемпотентно: каждая колонка добавляется только если её ещё нет.
-- ============================================================================

DROP PROCEDURE IF EXISTS sttm_add_column;

DELIMITER //
CREATE PROCEDURE sttm_add_column(
  IN col_name  VARCHAR(64),
  IN col_ddl   VARCHAR(255)
)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'mission_info'
          AND COLUMN_NAME = col_name) = 0 THEN
    SET @ddl := CONCAT('ALTER TABLE mission_info ADD COLUMN ', col_ddl);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- Конспект урока (приватные документы, ascii-ключи как у teacher_guide_*).
CALL sttm_add_column('lesson_notes_ru',
  'lesson_notes_ru VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL');
CALL sttm_add_column('lesson_notes_name_ru',
  'lesson_notes_name_ru VARCHAR(255) DEFAULT NULL');
CALL sttm_add_column('lesson_notes_uz',
  'lesson_notes_uz VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL');
CALL sttm_add_column('lesson_notes_name_uz',
  'lesson_notes_name_uz VARCHAR(255) DEFAULT NULL');

-- Двуязычное видео (публичный бакет, ascii-ключи как у video_key).
CALL sttm_add_column('video_key_ru',
  'video_key_ru VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL');
CALL sttm_add_column('video_name_ru',
  'video_name_ru VARCHAR(255) DEFAULT NULL');
CALL sttm_add_column('video_key_uz',
  'video_key_uz VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL');
CALL sttm_add_column('video_name_uz',
  'video_name_uz VARCHAR(255) DEFAULT NULL');

DROP PROCEDURE IF EXISTS sttm_add_column;
