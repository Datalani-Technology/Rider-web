import { collection, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Writes an email document to the Firestore `mail` collection.
 * Firebase "Trigger Email" Extension processes this and sends the actual email.
 * Setup: https://extensions.dev/extensions/firebase/firestore-send-email
 *
 * If the extension is not configured, documents accumulate in Firestore
 * and can be processed later — no errors occur in the meantime.
 */
export const sendAdminEmail = async (
  subject: string,
  html: string,
): Promise<void> => {
  try {
    // Fetch admin email from appConfig/settings
    const configSnap = await getDoc(doc(db, 'appConfig', 'settings'));
    const adminEmail = configSnap.data()?.adminEmail as string | undefined;
    if (!adminEmail) return; // Email not configured — silently skip

    await addDoc(collection(db, 'mail'), {
      to: [adminEmail],
      message: {
        subject: `[DASH Admin] ${subject}`,
        html,
        text: html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
      },
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal — admin email is a best-effort notification
  }
};

// ─── Email templates ──────────────────────────────────────────────────────────

export const emailTemplates = {
  newRiderPending: (name: string, phone: string, vehicle: string) => ({
    subject: `New Rider Pending Approval — ${name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0d0d0d;color:#fff;border-radius:12px;">
        <h1 style="color:#FF3B00;font-size:24px;margin:0 0 16px;">🏍️ New Rider Registration</h1>
        <p style="color:#ccc;margin:0 0 20px;">A new rider has registered and is waiting for your approval.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:10px;color:#888;border-bottom:1px solid #222;">Name</td><td style="padding:10px;color:#fff;border-bottom:1px solid #222;font-weight:600;">${name}</td></tr>
          <tr><td style="padding:10px;color:#888;border-bottom:1px solid #222;">Phone</td><td style="padding:10px;color:#fff;border-bottom:1px solid #222;">${phone}</td></tr>
          <tr><td style="padding:10px;color:#888;">Vehicle</td><td style="padding:10px;color:#fff;font-weight:600;">${vehicle}</td></tr>
        </table>
        <a href="https://dash-ab092.web.app/riders" style="display:inline-block;padding:12px 24px;background:#FF3B00;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Review Application →</a>
        <p style="color:#555;font-size:12px;margin-top:24px;">DASH Admin Console · Windhoek, Namibia</p>
      </div>
    `,
  }),

  newWalletRequest: (riderName: string, credits: number, amount: number, packageName: string, paymentMethod: string) => ({
    subject: `Wallet Top-Up Request — ${riderName} (N$${amount})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0d0d0d;color:#fff;border-radius:12px;">
        <h1 style="color:#27AE60;font-size:24px;margin:0 0 16px;">💳 Top-Up Request</h1>
        <p style="color:#ccc;margin:0 0 20px;">A rider has submitted a credit purchase request and is awaiting your approval.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:10px;color:#888;border-bottom:1px solid #222;">Rider</td><td style="padding:10px;color:#fff;border-bottom:1px solid #222;font-weight:600;">${riderName}</td></tr>
          <tr><td style="padding:10px;color:#888;border-bottom:1px solid #222;">Package</td><td style="padding:10px;color:#fff;border-bottom:1px solid #222;">${packageName}</td></tr>
          <tr><td style="padding:10px;color:#888;border-bottom:1px solid #222;">Credits</td><td style="padding:10px;color:#27AE60;border-bottom:1px solid #222;font-weight:700;">+${credits} credits</td></tr>
          <tr><td style="padding:10px;color:#888;border-bottom:1px solid #222;">Amount</td><td style="padding:10px;color:#fff;border-bottom:1px solid #222;font-weight:600;">N$${amount.toFixed(2)}</td></tr>
          <tr><td style="padding:10px;color:#888;">Payment</td><td style="padding:10px;color:#fff;">${paymentMethod.toUpperCase()}</td></tr>
        </table>
        <a href="https://dash-ab092.web.app/wallet" style="display:inline-block;padding:12px 24px;background:#27AE60;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Review & Approve →</a>
        <p style="color:#555;font-size:12px;margin-top:24px;">DASH Admin Console · Windhoek, Namibia</p>
      </div>
    `,
  }),
};
