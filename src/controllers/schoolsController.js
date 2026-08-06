const services = require("../services/schoolsService");

/** Suggestions for the school field, so teachers pick an existing school. */
const getSchools = async (req, res) => {
  try {
    const cityId = Number(req.query.cityId);
    if (!Number.isInteger(cityId) || cityId <= 0) {
      return res.status(400).json({ message: "cityId is required" });
    }

    const result = await services.getSchoolsByCity(cityId);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching schools" });
  }
};

module.exports = {
  getSchools,
};
