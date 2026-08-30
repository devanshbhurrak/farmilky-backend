/**
 * WhatsApp Invoice Service
 * Currently a stub — logs to console.
 * Replace `sendDocument` with actual Twilio/WhatsApp Business API call.
 */
import Invoice from "../models/invoice.model.js";
import { generateInvoicePDF } from "./pdfService.js";

/**
 * Send an invoice via WhatsApp.
 * @param {string} invoiceId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function sendInvoiceViaWhatsApp(invoiceId) {
  const invoice = await Invoice.findById(invoiceId)
    .populate("userId", "name phone")
    .lean();

  if (!invoice) throw new Error("Invoice not found");

  const phone = invoice.userId?.phone;
  if (!phone) throw new Error("Customer phone number not available");

  const pdfBuffer = await generateInvoicePDF(invoice, { detailed: false });

  // ── Stub: replace this block with real WhatsApp API call ──
  console.log(`[WhatsApp] Sending invoice ${invoice.invoiceNumber} to ${phone} (${pdfBuffer.length} bytes)`);
  // Example Twilio integration:
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({
  //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
  //   to: `whatsapp:+91${phone}`,
  //   mediaUrl: [await uploadPdfToStorage(pdfBuffer)],
  //   body: `Hi ${invoice.userId.name}, your Farmilky invoice ${invoice.invoiceNumber} is attached.`,
  // });
  // ─────────────────────────────────────────────────────────

  // Update invoice record
  await Invoice.findByIdAndUpdate(invoiceId, {
    $set: {
      sentAt: new Date(),
      sentVia: "whatsapp",
      status: invoice.status === "draft" ? "sent" : invoice.status,
    },
  });

  return { success: true, message: `Invoice ${invoice.invoiceNumber} queued for WhatsApp delivery to ${phone}` };
}
