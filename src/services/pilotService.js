const pool = require("../config/db");

/**
 * Сводка по пилоту: одна строка — один класс.
 *
 * Отчёт собирается из четырёх плоских запросов и разворачивается в JS, а не
 * одним SQL-пивотом на 37 колонок: миссий в пилоте десять, но их число меняется,
 * и пивот пришлось бы переписывать под каждое изменение каталога.
 *
 * Что именно считается — три решения, которые стоит держать в голове, читая
 * цифры:
 *
 *  • «Дата первого открытия презентации» — по УЧИТЕЛЮ, не по классу.
 *    Презентация открывается на странице миссии, где класс не выбран, а классов
 *    у учителя бывает несколько. Поэтому у всех классов одного учителя дата
 *    открытия одинаковая. Колонка `mission_guide_opens.class_id` заведена под
 *    будущее уточнение и пока всегда NULL.
 *
 *  • «Завершили тест» — уникальные ученики, а не попытки. Перепрохождение
 *    счётчик не двигает.
 *
 *  • Знаменатель вовлечённости — число подключённых учеников НА МОМЕНТ
 *    выгрузки. Завершения копились, когда учеников могло быть меньше, так что
 *    процент скорее занижен, чем завышен.
 */

/** Миссия попадает в отчёт, если она видна ученикам. Скрытые — нет. */
const MISSION_SCOPE = "m.is_active = 1";

/** Классы с учителем, школой и числом подключённых учеников. */
const fetchClasses = async () => {
  const [rows] = await pool.query(
    `SELECT c.id,
            c.grade,
            c.letter,
            c.alphabet,
            c.join_code,
            u.id    AS teacher_id,
            u.name  AS teacher_name,
            u.phone AS teacher_phone,
            s.name  AS school_name,
            ci.name_ru AS city_name,
            (SELECT COUNT(*)
               FROM class_students cs
              WHERE cs.class_id = c.id
                AND cs.status <> 'removed') AS students_connected
       FROM classes c
       JOIN users   u  ON u.id  = c.teacher_id
       JOIN schools s  ON s.id  = c.school_id
       JOIN cities  ci ON ci.id = s.city_id
      ORDER BY ci.name_ru, s.name, c.grade, c.letter`,
  );
  return rows;
};

/** Каталог миссий пилота в том порядке, в котором их проходят. */
const fetchMissions = async () => {
  const [rows] = await pool.query(
    `SELECT m.id, m.level, m.name, m.label, m.test_id
       FROM missions m
      WHERE ${MISSION_SCOPE}
      ORDER BY m.level, m.id`,
  );
  return rows;
};

/**
 * Завершения тестов в разрезе (класс, миссия).
 *
 * Связь «тест → миссия» идёт через `missions.test_id` (миграция 011), а не
 * через совпадение номеров: номера правятся в двух разных формах админки и
 * могут разъехаться.
 *
 * `first_completed_at`, а не `completed_at`: второй перезаписывается при каждом
 * перепрохождении и означает «последний раз», а не «первый» (миграция 012).
 */
const fetchCompletions = async () => {
  const [rows] = await pool.query(
    `SELECT cs.class_id,
            m.id AS mission_id,
            COUNT(DISTINCT st.user_id)  AS students_done,
            MIN(st.first_completed_at)  AS first_done
       FROM class_students cs
       JOIN student_tests st
              ON st.user_id = cs.student_id
             AND st.completed_at IS NOT NULL
       JOIN missions m ON m.test_id = st.test_id
      WHERE cs.status <> 'removed'
        AND ${MISSION_SCOPE}
      GROUP BY cs.class_id, m.id`,
  );
  return rows;
};

/** Первое открытие презентации в разрезе (учитель, миссия). */
const fetchGuideOpens = async () => {
  const [rows] = await pool.query(
    `SELECT o.user_id AS teacher_id,
            o.mission_id,
            MIN(o.opened_at) AS first_open
       FROM mission_guide_opens o
       JOIN missions m ON m.id = o.mission_id
      WHERE ${MISSION_SCOPE}
      GROUP BY o.user_id, o.mission_id`,
  );
  return rows;
};

/** «5А» — как класс называют в школе. */
const classLabel = (row) => `${row.grade}${row.letter}`;

/** Ключ составной карты; шаблонная строка, чтобы 1×23 не слиплось с 12×3. */
const pairKey = (left, right) => `${left}:${right}`;

const buildReport = ({ classes, missions, completions, guideOpens }) => {
  const doneBy = new Map(
    completions.map((row) => [pairKey(row.class_id, row.mission_id), row]),
  );
  const openBy = new Map(
    guideOpens.map((row) => [pairKey(row.teacher_id, row.mission_id), row]),
  );

  const rows = classes.map((klass) => {
    const connected = Number(klass.students_connected);

    const perMission = missions.map((mission) => {
      const done = doneBy.get(pairKey(klass.id, mission.id));
      const open = openBy.get(pairKey(klass.teacher_id, mission.id));
      const studentsDone = done ? Number(done.students_done) : 0;

      return {
        mission_id: mission.id,
        level: mission.level,
        label: mission.label ?? mission.name,
        guide_opened_at: open ? open.first_open : null,
        students_done: studentsDone,
        first_completed_at: done ? done.first_done : null,
      };
    });

    // «Миссия проведена» = тест завершил хотя бы один ученик класса. Открытой
    // презентации для этого мало: она говорит лишь о том, что учитель посмотрел
    // материал, а не о том, что урок состоялся.
    const delivered = perMission.filter((item) => item.students_done > 0);

    // Класс без подключённых учеников оставляем без процента, а не с нулём:
    // делить не на что, и ноль читался бы как «пробовали, не вышло».
    const engagement =
      connected > 0 && delivered.length > 0
        ? delivered.reduce(
            (sum, item) => sum + item.students_done / connected,
            0,
          ) /
          delivered.length
        : null;

    return {
      class_id: klass.id,
      teacher_name: klass.teacher_name,
      teacher_phone: klass.teacher_phone,
      city_name: klass.city_name,
      school_name: klass.school_name,
      class_label: classLabel(klass),
      join_code: klass.join_code,
      students_connected: connected,
      missions: perMission,
      missions_delivered: delivered.length,
      /** Доля 0..1; null — посчитать не из чего. */
      avg_engagement: engagement,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    missions: missions.map((mission) => ({
      id: mission.id,
      level: mission.level,
      label: mission.label ?? mission.name,
      /** false — у миссии нет теста, её колонка «завершили» всегда пустая. */
      has_test: Boolean(mission.test_id),
    })),
    rows,
  };
};

const getReport = async () => {
  const [classes, missions, completions, guideOpens] = await Promise.all([
    fetchClasses(),
    fetchMissions(),
    fetchCompletions(),
    fetchGuideOpens(),
  ]);

  return buildReport({ classes, missions, completions, guideOpens });
};

module.exports = {
  getReport,
  // Наружу ради тестов и отладки на живых данных.
  buildReport,
};
