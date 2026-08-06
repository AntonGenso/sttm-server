/**
 * Fills the `cities` reference table (city select in the "create class" modal).
 *
 * Run with `npm run seed:cities`. Safe to re-run: rows are matched by their
 * russian name, existing ones only get their uz name / region refreshed.
 */
const pool = require("../src/config/db");

// The capital, the republic capital and every regional centre, followed by the
// larger cities teachers are likely to work in.
const CITIES = [
  ["Ташкент", "Toshkent", "Ташкент"],
  ["Нукус", "Nukus", "Республика Каракалпакстан"],
  ["Андижан", "Andijon", "Андижанская область"],
  ["Бухара", "Buxoro", "Бухарская область"],
  ["Джизак", "Jizzax", "Джизакская область"],
  ["Карши", "Qarshi", "Кашкадарьинская область"],
  ["Навои", "Navoiy", "Навоийская область"],
  ["Наманган", "Namangan", "Наманганская область"],
  ["Самарканд", "Samarqand", "Самаркандская область"],
  ["Гулистан", "Guliston", "Сырдарьинская область"],
  ["Термез", "Termiz", "Сурхандарьинская область"],
  ["Фергана", "Farg'ona", "Ферганская область"],
  ["Ургенч", "Urganch", "Хорезмская область"],
  ["Нурафшан", "Nurafshon", "Ташкентская область"],

  ["Алмалык", "Olmaliq", "Ташкентская область"],
  ["Ангрен", "Angren", "Ташкентская область"],
  ["Бекабад", "Bekobod", "Ташкентская область"],
  ["Чирчик", "Chirchiq", "Ташкентская область"],
  ["Янгиюль", "Yangiyoʻl", "Ташкентская область"],
  ["Асака", "Asaka", "Андижанская область"],
  ["Хонабад", "Xonobod", "Андижанская область"],
  ["Шахрихан", "Shahrixon", "Андижанская область"],
  ["Каган", "Kogon", "Бухарская область"],
  ["Гиждуван", "Gʻijduvon", "Бухарская область"],
  ["Шахрисабз", "Shahrisabz", "Кашкадарьинская область"],
  ["Гузар", "Gʻuzor", "Кашкадарьинская область"],
  ["Зарафшан", "Zarafshon", "Навоийская область"],
  ["Учкудук", "Uchquduq", "Навоийская область"],
  ["Чуст", "Chust", "Наманганская область"],
  ["Касансай", "Kosonsoy", "Наманганская область"],
  ["Каттакурган", "Kattaqoʻrgʻon", "Самаркандская область"],
  ["Ургут", "Urgut", "Самаркандская область"],
  ["Денау", "Denov", "Сурхандарьинская область"],
  ["Шерабад", "Sherobod", "Сурхандарьинская область"],
  ["Коканд", "Qoʻqon", "Ферганская область"],
  ["Маргилан", "Margʻilon", "Ферганская область"],
  ["Кувасай", "Quvasoy", "Ферганская область"],
  ["Риштан", "Rishton", "Ферганская область"],
  ["Хива", "Xiva", "Хорезмская область"],
  ["Ширин", "Shirin", "Сырдарьинская область"],
  ["Янгиер", "Yangiyer", "Сырдарьинская область"],
];

const seed = async () => {
  const [result] = await pool.query(
    `INSERT INTO cities (name_ru, name_uz, region)
     VALUES ?
     ON DUPLICATE KEY UPDATE name_uz = VALUES(name_uz), region = VALUES(region)`,
    [CITIES],
  );

  console.log(`Seeded ${CITIES.length} cities (affected rows: ${result.affectedRows})`);
  await pool.end();
};

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
