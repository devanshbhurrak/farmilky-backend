import Holiday from "../models/holiday.model.js";

const normalizeDate = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const createHoliday = async (req, res) => {
  try {
    const { date, name } = req.body;
    if (!date || !name) {
      return res.status(400).json({ message: "Date and name are required." });
    }
    const normalized = normalizeDate(date);
    const existing = await Holiday.findOne({ date: normalized });
    if (existing) {
      return res.status(409).json({ message: "A holiday already exists on this date." });
    }
    const holiday = await Holiday.create({ date: normalized, name });
    res.status(201).json({ message: "Holiday created.", holiday });
  } catch (error) {
    console.error("Create Holiday Error:", error);
    res.status(500).json({ message: "Failed to create holiday." });
  }
};

export const getAllHolidays = async (req, res) => {
  try {
    const { year } = req.query;
    let filter = {};
    if (year) {
      const y = parseInt(year, 10);
      filter.date = {
        $gte: new Date(y, 0, 1),
        $lte: new Date(y, 11, 31),
      };
    }
    const holidays = await Holiday.find(filter).sort({ date: 1 });
    res.status(200).json({ count: holidays.length, holidays });
  } catch (error) {
    console.error("Get Holidays Error:", error);
    res.status(500).json({ message: "Failed to fetch holidays." });
  }
};

export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;
    const holiday = await Holiday.findById(id);
    if (!holiday) return res.status(404).json({ message: "Holiday not found." });
    if (name !== undefined) holiday.name = name;
    if (isActive !== undefined) holiday.isActive = isActive;
    await holiday.save();
    res.status(200).json({ message: "Holiday updated.", holiday });
  } catch (error) {
    console.error("Update Holiday Error:", error);
    res.status(500).json({ message: "Failed to update holiday." });
  }
};

export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await Holiday.findByIdAndDelete(id);
    if (!holiday) return res.status(404).json({ message: "Holiday not found." });
    res.status(200).json({ message: "Holiday deleted." });
  } catch (error) {
    console.error("Delete Holiday Error:", error);
    res.status(500).json({ message: "Failed to delete holiday." });
  }
};
