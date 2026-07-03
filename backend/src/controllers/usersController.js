const services = require("../services/usersService");

const getUsers = async (req, res) => {
  try {
    const result = await services.getUsers();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await services.getUserById(id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching user by ID" });
  }
};

module.exports = {
  getUsers,
  getUserById,
};
