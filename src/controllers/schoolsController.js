const services = require("../services/schoolsService");

const readCityId = (req) => {
  const cityId = Number(req.query.cityId);
  return Number.isInteger(cityId) && cityId > 0 ? cityId : null;
};

/** Школы города — список, из которого учитель выбирает свою. */
const getSchools = async (req, res) => {
  try {
    const cityId = readCityId(req);
    if (!cityId) {
      return res.status(400).json({ message: "cityId is required" });
    }

    const result = await services.getSchoolsByCity(cityId);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching schools" });
  }
};

/**
 * «Возможно, вы имели в виду»: школы города, похожие на введённое название.
 *
 * Спрашивается ровно перед тем, как учитель заведёт новую школу — это дешёвый
 * способ не получить «Школу №5» рядом со «Школой №5 им. Навои».
 */
const getSimilarSchools = async (req, res) => {
  try {
    const cityId = readCityId(req);
    if (!cityId) {
      return res.status(400).json({ message: "cityId is required" });
    }

    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (!name) {
      return res.json([]);
    }

    res.json(await services.findSimilarSchools(cityId, name));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching schools" });
  }
};

module.exports = {
  getSchools,
  getSimilarSchools,
};
