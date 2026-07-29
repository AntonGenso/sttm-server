const services = require("../services/rolesService");

const getRoles = async (req, res) => {
  try {
    const result = await services.getRoles();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching roles" });
  }
};

module.exports = {
  getRoles,
};
