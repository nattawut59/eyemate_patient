const cron = require('node-cron');
const appointmentService = require('../services/appointment.service');

/**
 * Cron job สำหรับส่งการแจ้งเตือนนัดหมาย
 * ทำงานทุกวันเวลา 09:00 น.
 */
function startAppointmentRemindersCron() {
  // Schedule: ทุกวันเวลา 09:00 น.
  // Format: วินาที นาที ชั่วโมง วัน เดือน วันในสัปดาห์
  cron.schedule('0 9 * * *', async () => {
    console.log('Running appointment reminders cron job...');
    
    try {
      const result = await appointmentService.sendAppointmentReminders();
      console.log(`Appointment reminders sent: ${result.count} notifications`);
    } catch (error) {
      console.error('Error in appointment reminders cron job:', error);
    }
  }, {
    timezone: 'Asia/Bangkok'
  });
  
  console.log('Appointment reminders cron job started (runs daily at 09:00)');
}

/**
 * ทดสอบส่ง reminders ทันที (สำหรับ testing)
 */
async function testSendReminders() {
  console.log('Testing appointment reminders...');
  
  try {
    const result = await appointmentService.sendAppointmentReminders();
    console.log(`Test completed: ${result.count} notifications sent`);
    return result;
  } catch (error) {
    console.error('Error in test reminders:', error);
    throw error;
  }
}

module.exports = {
  startAppointmentRemindersCron,
  testSendReminders
};