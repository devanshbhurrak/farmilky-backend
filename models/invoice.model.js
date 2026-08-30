import mongoose from "mongoose";

const rateBreakdownSchema = new mongoose.Schema({
  rate: Number,
  quantity: Number,
  amount: Number,
}, { _id: false });

const productSummarySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  productName: String,
  variantLabel: String,
  unit: String,
  totalQuantity: { type: Number, default: 0 },
  avgRate: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  outstandingAmount: { type: Number, default: 0 },
  rateBreakdown: [rateBreakdownSchema],
}, { _id: false });

const lineItemSchema = new mongoose.Schema({
  date: Date,
  description: String,
  category: { type: String, enum: ["Subscription", "Order", "Payment", "Adjustment", "Credit"] },
  referenceId: mongoose.Schema.Types.ObjectId,
  referenceModel: { type: String, enum: ["Subscription", "Order", "Payment"] },
  quantity: Number,
  unitPrice: Number,
  amount: Number,
  productName: String,
  variantLabel: String,
  unit: String,
  entryType: { type: String, enum: ["debit", "credit"] },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  billingPeriod: {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
  },
  previousBalance: { type: Number, default: 0 },
  totalCharges: { type: Number, default: 0 },
  orderCredits: { type: Number, default: 0 },  // order reversals / cancellations credited
  totalPayments: { type: Number, default: 0 },
  totalAdjustments: { type: Number, default: 0 },
  netAmountDue: { type: Number, default: 0 },
  lineItems: [lineItemSchema],
  productSummary: [productSummarySchema],
  status: {
    type: String,
    enum: ["draft", "sent", "paid", "partially_paid", "overdue", "cancelled", "void"],
    default: "draft",
  },
  isEarlyBilling: { type: Boolean, default: false },
  billingCutoffDate: Date,
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
  replacedByInvoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
  voidReason: String,
  sentAt: Date,
  sentVia: { type: String, enum: ["whatsapp", "email", "manual"] },
  paidAt: Date,
  generatedBy: { type: String, enum: ["system", "admin"], default: "system" },
  generatedByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notes: String,
}, {
  timestamps: true,
  optimisticConcurrency: true,
});

// Compound index: one non-void invoice per customer per month
invoiceSchema.index({ userId: 1, "billingPeriod.year": 1, "billingPeriod.month": 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ "billingPeriod.year": 1, "billingPeriod.month": 1 });
// invoiceNumber uniqueness is enforced by the field-level `unique: true` — no separate index needed

const Invoice = mongoose.model("Invoice", invoiceSchema);
export default Invoice;
