// routes/medicationReminder.routes.js

const express = require('express');
const router = express.Router();
const medicationReminderController = require('../controllers/medicationReminder.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { validateScheduleCreation, validateScheduleUpdate } = require('../middleware/validation.middleware');

// ✅ ทุก endpoint ต้อง login และเป็น patient
router.use(verifyToken);
router.use(verifyRole(['patient']));

router.get('/', 
  medicationReminderController.getReminders
);
/**
 * 10.1 สร้าง/อัปเดต Medication Schedule
 */
router.post('/schedules', 
  validateScheduleCreation,
  medicationReminderController.createSchedule
);

router.put('/schedules/:scheduleId',
  validateScheduleUpdate,
  medicationReminderController.updateSchedule
);

/**
 * 10.2 ดูรอบยาที่จะถึง
 */
router.get('/schedules/upcoming',
  medicationReminderController.getUpcomingDoses
);

/**
 * 10.3 ยืนยัน/ข้าม/เลื่อนเวลา
 */
router.post('/logs/confirm',
  medicationReminderController.confirmDose
);

router.post('/logs/skip',
  medicationReminderController.skipDose
);

router.post('/logs/snooze',
  medicationReminderController.snoozeDose
);

/**
 * 10.4 ปรับเวลาหยอดยา
 */
router.post('/schedules/:scheduleId/adjust-time',
  medicationReminderController.adjustDoseTime
);

/**
 * 10.5 Sleep Mode
 */
router.put('/schedules/:scheduleId/sleep-mode',
  medicationReminderController.updateSleepMode
);

/**
 * 10.6 ตรวจสอบเวลาชนกัน
 */
router.post('/schedules/check-collision',
  medicationReminderController.checkDoseCollision
);

/**
 * 10.7 การตั้งค่าการแจ้งเตือน
 */
router.get('/notification-settings',
  medicationReminderController.getNotificationSettings
);

router.put('/notification-settings',
  medicationReminderController.updateNotificationSettings
);

/**
 * 10.8 Push Token
 */
router.post('/push-token',
  medicationReminderController.registerPushToken
);

/**
 * 10.9 Compliance Report
 */
router.get('/compliance',
  medicationReminderController.getComplianceReport
);

/**
 * 10.10 ประวัติการแจ้งเตือน
 */
router.get('/notification-history',
  medicationReminderController.getNotificationHistory
);

/**
 * อื่นๆ
 */
router.get('/schedules',
  medicationReminderController.getAllSchedules
);

router.delete('/schedules/:scheduleId',
  medicationReminderController.deleteSchedule
);

module.exports = router;