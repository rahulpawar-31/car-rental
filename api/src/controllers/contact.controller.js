import { AppError } from "../middleware/errorHandler.js";
import { sendEmail } from "../utils/email.utils.js";
import { escapeHtml } from "../utils/html.utils.js";

export const submitContact = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    throw new AppError("name, email, subject, and message are required", 400);
  }

  const adminEmail = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.EMAIL_USER;
  if (!adminEmail) throw new AppError("Admin email is not configured", 500);

  // Visitor-supplied, so escaped before it goes into the HTML body (the plain-text part needs none).
  const safe = { name: escapeHtml(name), email: escapeHtml(email), subject: escapeHtml(subject), message: escapeHtml(message) };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1a56db, #7e3af2); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">New Contact Form Submission</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
        <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <p><strong>Name:</strong> ${safe.name}</p>
          <p><strong>Email:</strong> ${safe.email}</p>
          <p><strong>Subject:</strong> ${safe.subject}</p>
        </div>
        <div style="background: white; border-radius: 8px; padding: 20px;">
          <p><strong>Message:</strong></p>
          <p style="color: #374151; white-space: pre-wrap;">${safe.message}</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">This message was submitted via the DriveEase contact form.</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: adminEmail,
    subject: `[Contact Form] ${subject}`,
    html,
    text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`,
  });

  res.json({ success: true, message: "Message sent successfully" });
};
