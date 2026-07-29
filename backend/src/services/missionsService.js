const pool = require("../config/db");

const getMissions = async () => {
  try {
    const [rows] = await pool.query("SELECT * FROM missions");
    return rows;
  } catch (error) {
    console.error(error);
    throw new Error("Error gettiong missions");
  }
};

const createNewMission = async (missionName, missionLabel) => {
  try {
    const [result] = await pool.query(
      "INSERT INTO missions (name, label) VALUES (?, ?)",
      [missionName, missionLabel],
    );
    return { id: result.insertId, name: missionName, label: missionLabel };
  } catch (error) {
    console.error(error);
    throw new Error("Can't create mission");
  }
};

module.exports = {
  createNewMission,
  getMissions,
};
