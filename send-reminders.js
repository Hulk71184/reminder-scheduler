import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// Init SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Init Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendEmail(to, subject, text) {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject,
    text
  };

  try {
    await sgMail.send(msg);
    console.log(`📧 Email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
    return false;
  }
}

async function sendWhatsApp(to, body) {
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to,
      body
    });
    console.log(`📱 WhatsApp sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send WhatsApp to ${to}:`, err.message);
    return false;
  }
}

async function run() {
  console.log('🚀 Starting reminder dispatch...');

  const now = new Date().toISOString();

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('sent', false)
    .lte('send_at', now);

  if (error) throw error;

  for (const reminder of reminders) {
    const message = `Reminder: Your document (ID: ${reminder.document_id}) is expiring soon.`;

    let success = false;

    if (reminder.channel === 'email' && reminder.email) {
      success = await sendEmail(reminder.email, 'Document Expiry Reminder', message);
    } else if (reminder.channel === 'whatsapp' && reminder.whatsapp) {
      success = await sendWhatsApp(reminder.whatsapp, message);
    }

    if (success) {
      const { error: updateError } = await supabase
        .from('reminders')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq('id', reminder.id);

      if (updateError) {
        console.error(`⚠️ Failed to update status for reminder ${reminder.id}`);
      }
    }
  }

  console.log('✅ Reminder dispatch complete.');
}

run().catch(err => {
  console.error('❌ Unhandled error:', err.message);
  process.exit(1);
});
