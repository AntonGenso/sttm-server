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
            SUM(st.status =  'done') AS students_done,
            SUM(st.status <> 'done') AS students_in_progress,
            MIN(CASE WHEN st.status = 'done' THEN st.first_completed_at END)
              AS first_done
       FROM class_students cs
       JOIN student_tests st ON st.user_id = cs.student_id
       JOIN missions m ON m.test_id = st.test_id
      WHERE cs.status <> 'removed'
        AND ${MISSION_SCOPE}
      GROUP BY cs.class_id, m.id`,
  );
  return rows;
};

/**
 * Первое событие каждого вида в разрезе (учитель, миссия).
 *
 * `lesson` — нажал «Начать урок», прямой признак начала урока. `guide` —
 * открыл презентацию; это могло случиться и накануне, при подготовке, поэтому
 * два вида не смешиваются в одну дату.
 */
const fetchTeacherEvents = async () => {
  const [rows] = await pool.query(
    `SELECT e.user_id AS teacher_id,
            e.mission_id,
            e.kind,
            MIN(e.opened_at) AS first_at
       FROM mission_teacher_events e
       JOIN missions m ON m.id = e.mission_id
      WHERE ${MISSION_SCOPE}
      GROUP BY e.user_id, e.mission_id, e.kind`,
  );
  return rows;
};

/** «5А» — как класс называют в школе. */
const classLabel = (row) => `${row.grade}${row.letter}`;

/** Ключ составной карты; шаблонная строка, чтобы 1×23 не слиплось с 12×3. */
const pairKey = (left, right) => `${left}:${right}`;

const buildReport = ({ classes, missions, completions, teacherEvents }) => {
  const doneBy = new Map(
    completions.map((row) => [pairKey(row.class_id, row.mission_id), row]),
  );
  // Ключ включает вид события: у одной пары (учитель, миссия) их два.
  const eventBy = new Map(
    teacherEvents.map((row) => [
      `${row.kind}:${pairKey(row.teacher_id, row.mission_id)}`,
      row,
    ]),
  );

  const rows = classes.map((klass) => {
    const connected = Number(klass.students_connected);

    const perMission = missions.map((mission) => {
      const done = doneBy.get(pairKey(klass.id, mission.id));
      const pair = pairKey(klass.teacher_id, mission.id);
      const guide = eventBy.get(`guide:${pair}`);
      const lesson = eventBy.get(`lesson:${pair}`);

      const studentsDone = done ? Number(done.students_done) : 0;
      const studentsInProgress = done ? Number(done.students_in_progress) : 0;

      return {
        mission_id: mission.id,
        level: mission.level,
        label: mission.label ?? mission.name,
        lesson_started_at: lesson ? lesson.first_at : null,
        guide_opened_at: guide ? guide.first_at : null,
        students_done: studentsDone,
        /**
         * Начал тест, но не закончил. Пока всегда 0: игра не сообщает о старте
         * (`startItem` не вызывается), и строка прогресса появляется только в
         * момент сдачи. Заполнится, когда игра начнёт отмечать старт.
         */
        students_in_progress: studentsInProgress,
        /** Остальные из подключённых — те, кто к тесту не приступал. */
        students_not_started: Math.max(
          connected - studentsDone - studentsInProgress,
          0,
        ),
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
  const [classes, missions, completions, teacherEvents] = await Promise.all([
    fetchClasses(),
    fetchMissions(),
    fetchCompletions(),
    fetchTeacherEvents(),
  ]);

  return buildReport({ classes, missions, completions, teacherEvents });
};

/**
 * Поимённо: кто из класса прошёл тест миссии, кто начал и не закончил, кто не
 * приступал. За числами в отчёте всегда должны стоять фамилии — иначе по ним
 * нельзя ничего сделать.
 *
 * Отдельным запросом, а не внутри отчёта: списки нужны по одной клетке за раз,
 * а в отчёте их было бы полторы тысячи.
 */
const getClassMissionStudents = async (classId, missionId) => {
  const [[mission]] = await pool.query(
    `SELECT m.id, m.level, m.label, m.name, m.test_id
       FROM missions m WHERE m.id = ?`,
    [missionId],
  );
  if (!mission) {
    const error = new Error("Mission not found");
    error.status = 404;
    throw error;
  }

  const [[klass]] = await pool.query(
    `SELECT c.id, c.grade, c.letter, s.name AS school_name,
            u.name AS teacher_name
       FROM classes c
       JOIN schools s ON s.id = c.school_id
       JOIN users   u ON u.id = c.teacher_id
      WHERE c.id = ?`,
    [classId],
  );
  if (!klass) {
    const error = new Error("Class not found");
    error.status = 404;
    throw error;
  }

  // Весь состав класса, а не только те, у кого есть прогресс: «не приступал» —
  // это и есть отсутствие строки в student_tests.
  const [students] = await pool.query(
    `SELECT u.id,
            u.name,
            COALESCE(st.status, 'none') AS status,
            st.best_score,
            st.attempts,
            st.first_completed_at
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       LEFT JOIN student_tests st
              ON st.user_id = u.id AND st.test_id = ?
      WHERE cs.class_id = ? AND cs.status <> 'removed'
      ORDER BY st.first_completed_at IS NULL, st.first_completed_at, u.name`,
    [mission.test_id, classId],
  );

  return {
    class: {
      id: klass.id,
      label: `${klass.grade}${klass.letter}`,
      school_name: klass.school_name,
      teacher_name: klass.teacher_name,
    },
    mission: {
      id: mission.id,
      level: mission.level,
      label: mission.label ?? mission.name,
      has_test: Boolean(mission.test_id),
    },
    students: students.map((row) => ({
      id: row.id,
      name: row.name,
      /** done — прошёл, in_progress — начал и не закончил, none — не приступал. */
      bucket:
        row.status === "done"
          ? "done"
          : row.status === "none"
            ? "none"
            : "in_progress",
      best_score: row.best_score,
      attempts: row.attempts,
      first_completed_at: row.first_completed_at,
    })),
  };
};

module.exports = {
  getReport,
  getClassMissionStudents,
  // Наружу ради тестов и отладки на живых данных.
  buildReport,
};
