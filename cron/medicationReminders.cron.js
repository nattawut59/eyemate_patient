// cron/medicationReminders.cron.js
const cron = require('node-cron');
const medicationReminderService = require('../services/medicationReminder.service');

function startMedicationRemindersCron() {
  // ทุก 1 นาที
  cron.schedule('* * * * *', async () => {
    try {
      const result = await medicationReminderService.sendMedicationReminders();
      if (result.count > 0) {
        console.log(`Medication reminders sent: ${result.count}`);
      }
    } catch (error) {
      console.error('Error in medication reminders cron job:', error);
    }
  }, { timezone: 'Asia/Bangkok' });

  console.log('Medication reminders cron job started (runs every minute)');
}

module.exports = { startMedicationRemindersCron };
