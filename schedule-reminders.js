import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const today = dayjs().startOf('day');

async function run() {
  console.log('⏱️ Starting reminder scheduler...');

  const { data: plans, error } = await supabase
    .from('reminder_plans')
    .select('*, documents(expiry_date)');

  if (error) throw error;

  for (const plan of plans) {
    const expiry = dayjs(plan.documents.expiry_date);
    const scheduleDays = plan.days || [];

    scheduleDays.forEach(async (dayBefore) => {
      const reminderDate = expiry.subtract(dayBefore, 'day').startOf('day');

      if (!reminderDate.isSame(today)) return;

      const [hour, minute] = plan.time.split(':').map(Number);
      const send_at = dayjs().hour(hour).minute(minute).second(0);

      const baseReminder = {
        document_id: plan.document_id,
        user_id: plan.user_id,
        send_at: send_at.toISOString(),
        status: 'pending',
        retry_count: 0
      };

      const remindersToInsert = [
        { ...baseReminder, channel: 'email', email: plan.recipient_email },
        ...(plan.recipient_whatsapp ? [{ ...baseReminder, channel: 'whatsapp', whatsapp: plan.recipient_whatsapp }] : []),
        ...(plan.extra_emails || []).map(email => ({ ...baseReminder, channel: 'email', email })),
        ...(plan.extra_whatsapps || []).map(whatsapp => ({ ...baseReminder, channel: 'whatsapp', whatsapp }))
      ];

      const { error: insertError } = await supabase
        .from('reminders')
        .insert(remindersToInsert);

      if (insertError) {
        console.error('❌ Failed to insert reminders for document:', plan.document_id, insertError.message);
      } else {
        console.log(`📬 Scheduled ${remindersToInsert.length} reminders for doc: ${plan.document_id}`);
      }
    });
  }

  console.log('✅ Finished reminder scheduling.');
}

run().catch(err => {
  console.error('Unhandled error in reminder scheduler:', err.message);
  process.exit(1);
});
