const services = require("../services/citiesService");

const getCities = async (req, res) => {
  try {
    const result = await services.getCities();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching cities" });
  }
};

module.exports = {
  getCities,
};
