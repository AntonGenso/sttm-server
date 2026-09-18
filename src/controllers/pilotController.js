const pilotService = require("../services/pilotService");
const { toCsv } = require("../utils/csv");

/**
 * Пилот идёт в Узбекистане, и «дата урока» — это дата по Ташкенту. Считать её
 * по UTC нельзя: вечерний урок, начатый после 19:00 местного времени, уехал бы
 * в CSV на день назад. DST в Узбекистане отменён в 1992-м, поэтому +05:00
 * фиксирован и точен.
 */
const TASHKENT = "Asia/Tashkent";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TASHKENT,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `2026-08-18T06:47:56Z` → `18.08.2026`; null и мусор → пустая ячейка. */
const formatDate = (value) => {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
};

/** Доля 0..1 → «42» (проценты, целые). null остаётся пустым. */
const formatPercent = (value) =>
  value === null || value === undefined ? "" : String(Math.round(value * 100));

const getReport = async (req, res) => {
  try {
    res.json(await pilotService.getReport());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error building pilot report" });
  }
};

/**
 * Тот же отчёт файлом. Заголовок каждой миссии повторяет её номер во всех трёх
 * колонках — в CSV нет объединённых ячеек, а без номера в каждой колонке
 * тридцать столбцов подряд не читаются.
 */
const getReportCsv = async (req, res) => {
  try {
    const report = await pilotService.getReport();

    const header = [
      "Учитель",
      "Телефон",
      "Город",
      "Школа",
      "Класс",
      "Код класса",
      "Подключено учеников",
    ];

    report.missions.forEach((mission) => {
      const prefix = `M${mission.level} ${mission.label}`;
      header.push(
        `${prefix} — презентация`,
        `${prefix} — завершили тест`,
        `${prefix} — первый тест`,
      );
    });

    header.push("Миссий проведено", "Средняя вовлечённость, %");

    const rows = report.rows.map((row) => {
      const cells = [
        row.teacher_name,
        row.teacher_phone,
        row.city_name,
        row.school_name,
        row.class_label,
        row.join_code,
        row.students_connected,
      ];

      row.missions.forEach((mission) => {
        cells.push(
          formatDate(mission.guide_opened_at),
          mission.students_done,
          formatDate(mission.first_completed_at),
        );
      });

      cells.push(row.missions_delivered, formatPercent(row.avg_engagement));
      return cells;
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `sttm-pilot-${stamp}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(toCsv([header, ...rows]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error building pilot report" });
  }
};

module.exports = {
  getReport,
  getReportCsv,
  // Наружу ради тестов форматирования.
  formatDate,
  formatPercent,
};
