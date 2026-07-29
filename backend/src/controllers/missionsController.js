const services = require("../services/missionsService");

const getMissions = async (req, res) => {
  try {
    const result = await services.getMissions();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching missions" });
  }
};

const createMission = async (req, res) => {
  try {
    const { missionName } = req.query;

    const shortName = missionName.toLowerCase().replace(/\s+/g, "-");

    const result = await services.createNewMission(shortName, missionName);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating mission" });
  }
};

module.exports = {
  createMission,
  getMissions,
};
