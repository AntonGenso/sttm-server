const services = require("../services/statsService");

const getOverview = async (req, res) => {
  try {
    const result = await services.getOverview();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching stats" });
  }
};

module.exports = {
  getOverview,
};
