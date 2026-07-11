import mongoose from "mongoose";
import Supplier from "../models/supplier.model.js";
import MilkCollection from "../models/milkCollection.model.js";

export const getAllSuppliers = async (req, res) => {
  try {
    const { active } = req.query;
    const match = { isDeleted: false };
    if (active === "true") match.isActive = true;

    const suppliers = await Supplier.aggregate([
      { $match: match },
      {
        $addFields: {
          outstandingAmount: { $add: ["$supplyBalance", "$passbookBalance"] },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    res.status(200).json({ suppliers });
  } catch (error) {
    console.error("Get All Suppliers Error:", error);
    res.status(500).json({ message: "Failed to fetch suppliers." });
  }
};

export const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;

    const [supplier] = await Supplier.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $addFields: {
          outstandingAmount: { $add: ["$supplyBalance", "$passbookBalance"] },
        },
      },
    ]);

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found." });
    }

    res.status(200).json({ supplier });
  } catch (error) {
    console.error("Get Supplier By ID Error:", error);
    res.status(500).json({ message: "Failed to fetch supplier." });
  }
};

export const createSupplier = async (req, res) => {
  try {
    const {
      name, phone, email, location, pincode,
      joiningDate, collectionSessions,
      defaultMorningQty, defaultEveningQty, defaultRatePerLiter,
      bankDetails, notes,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required." });
    }

    const existing = await Supplier.findOne({ phone: phone.trim() });
    if (existing) {
      return res.status(409).json({ message: "A supplier with this phone number already exists." });
    }

    const supplier = await Supplier.create({
      name, phone, email, location, pincode,
      joiningDate: joiningDate || null,
      collectionSessions: collectionSessions || ["morning", "evening"],
      defaultMorningQty: defaultMorningQty || 0,
      defaultEveningQty: defaultEveningQty || 0,
      defaultRatePerLiter: defaultRatePerLiter || 0,
      bankDetails: bankDetails || {},
      notes: notes || "",
      updatedBy: req.user._id,
    });

    res.status(201).json({ message: "Supplier created.", supplier });
  } catch (error) {
    console.error("Create Supplier Error:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "A supplier with this phone number already exists." });
    }
    res.status(500).json({ message: "Failed to create supplier." });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, phone, email, location, pincode,
      joiningDate, collectionSessions,
      defaultMorningQty, defaultEveningQty, defaultRatePerLiter,
      bankDetails, notes,
    } = req.body;

    const supplier = await Supplier.findOne({ _id: id, isDeleted: false });
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found." });
    }

    // Check phone uniqueness if changed
    if (phone && phone !== supplier.phone) {
      const existing = await Supplier.findOne({ phone: phone.trim(), _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({ message: "A supplier with this phone number already exists." });
      }
    }

    Object.assign(supplier, {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(location !== undefined && { location }),
      ...(pincode !== undefined && { pincode }),
      ...(joiningDate !== undefined && { joiningDate }),
      ...(collectionSessions !== undefined && { collectionSessions }),
      ...(defaultMorningQty !== undefined && { defaultMorningQty }),
      ...(defaultEveningQty !== undefined && { defaultEveningQty }),
      ...(defaultRatePerLiter !== undefined && { defaultRatePerLiter }),
      ...(bankDetails !== undefined && { bankDetails }),
      ...(notes !== undefined && { notes }),
      updatedBy: req.user._id,
    });

    await supplier.save();
    res.status(200).json({ message: "Supplier updated.", supplier });
  } catch (error) {
    console.error("Update Supplier Error:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "A supplier with this phone number already exists." });
    }
    res.status(500).json({ message: "Failed to update supplier." });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await Supplier.findOne({ _id: id, isDeleted: false });
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found." });
    }

    // Always soft-delete — preserves collection history
    supplier.isDeleted = true;
    supplier.isActive = false;
    supplier.updatedBy = req.user._id;
    await supplier.save();

    res.status(200).json({ message: "Supplier removed." });
  } catch (error) {
    console.error("Delete Supplier Error:", error);
    res.status(500).json({ message: "Failed to delete supplier." });
  }
};

export const toggleSupplierStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const supplier = await Supplier.findOne({ _id: id, isDeleted: false });
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found." });
    }

    supplier.isActive = isActive !== undefined ? isActive : !supplier.isActive;
    supplier.updatedBy = req.user._id;
    await supplier.save();

    res.status(200).json({
      message: supplier.isActive ? "Supplier activated." : "Supplier deactivated.",
      supplier: { _id: supplier._id, name: supplier.name, isActive: supplier.isActive },
    });
  } catch (error) {
    console.error("Toggle Supplier Status Error:", error);
    res.status(500).json({ message: "Failed to update supplier status." });
  }
};
