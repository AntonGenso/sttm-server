/**
 * Пересчитывает ключи дедупликации справочников: `schools.name_normalized` и
 * `cities.name_normalized`.
 *
 * Запускать один раз после миграции 010 — и потом всякий раз, когда меняются
 * правила нормализации в `src/utils/dictionaries.js`. Пока ключ не пересчитан,
 * старые строки не находятся новым поиском, и та же школа заводится второй раз.
 *
 * Скрипт ничего не сливает сам: если у двух строк одного города совпал новый
 * ключ — это и есть дубль, но выбор, какая из них настоящая, за админом.
 * Такие пары печатаются списком и остаются со старым ключом, а объединяются в
 * админке, где видно, сколько классов и учеников за каждой.
 *
 * Запуск: npm run fix:dictionaries
 */
const pool = require("../src/config/db");
const {
  normalizeCityName,
  normalizeSchoolName,
} = require("../src/utils/dictionaries");

const fixCities = async () => {
  const [cities] = await pool.query("SELECT id, name_ru, name_normalized FROM cities");

  const seen = new Map();
  const conflicts = [];
  let updated = 0;

  for (const city of cities) {
    const normalized = normalizeCityName(city.name_ru);
    const twin = seen.get(normalized);

    if (twin) {
      conflicts.push({ normalized, ids: [twin.id, city.id], names: [twin.name_ru, city.name_ru] });
      continue;
    }
    seen.set(normalized, city);

    if (city.name_normalized === normalized) continue;
    await pool.query("UPDATE cities SET name_normalized = ? WHERE id = ?", [
      normalized,
      city.id,
    ]);
    updated += 1;
  }

  return { total: cities.length, updated, conflicts };
};

const fixSchools = async () => {
  const [schools] = await pool.query(
    "SELECT id, city_id, name, name_normalized FROM schools",
  );

  const seen = new Map();
  const conflicts = [];
  let updated = 0;

  for (const school of schools) {
    const normalized = normalizeSchoolName(school.name);
    const key = `${school.city_id}:${normalized}`;
    const twin = seen.get(key);

    if (twin) {
      conflicts.push({
        normalized,
        cityId: school.city_id,
        ids: [twin.id, school.id],
        names: [twin.name, school.name],
      });
      continue;
    }
    seen.set(key, school);

    if (school.name_normalized === normalized) continue;
    await pool.query("UPDATE schools SET name_normalized = ? WHERE id = ?", [
      normalized,
      school.id,
    ]);
    updated += 1;
  }

  return { total: schools.length, updated, conflicts };
};

const report = (label, result) => {
  console.log(
    `${label}: ${result.total} строк, ключ пересчитан у ${result.updated}`,
  );
  if (!result.conflicts.length) return;

  console.log(
    `  ${result.conflicts.length} пар(ы) с одинаковым ключом — объедините их в админке:`,
  );
  for (const conflict of result.conflicts) {
    console.log(
      `   • [${conflict.ids.join(", ")}] ${conflict.names.map((name) => `«${name}»`).join(" ↔ ")}`,
    );
  }
};

const run = async () => {
  try {
    report("Города", await fixCities());
    report("Школы", await fixSchools());
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
