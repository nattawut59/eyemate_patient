// controllers/medicationReminder.controller.js

const medicationReminderService = require('../services/medicationReminder.service');

/**
 * 10.1 สร้าง/อัปเดต Medication Schedule
 * POST /api/medication-reminders/schedules
 */
const createSchedule = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const scheduleData = req.body;

    const result = await medicationReminderService.createSchedule(patientId, scheduleData);

    return res.status(201).json({
      success: true,
      message: 'สร้างตารางเวลาหยอดยาสำเร็จ',
      data: result
    });

  } catch (error) {
    console.error('Error in createSchedule:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการสร้างตารางเวลา'
    });
  }
};

/**
 * 10.1 อัปเดต Medication Schedule
 * PUT /api/medication-reminders/schedules/:scheduleId
 */
const updateSchedule = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { scheduleId } = req.params;
    const scheduleData = req.body;

    const result = await medicationReminderService.updateSchedule(patientId, scheduleId, scheduleData);

    return res.json({
      success: true,
      message: 'อัปเดตตารางเวลาสำเร็จ',
      data: result
    });

  } catch (error) {
    console.error('Error in updateSchedule:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการอัปเดตตารางเวลา'
    });
  }
};

/**
 * 10.2 ดูรายการ schedules พร้อมรอบยาที่จะถึง
 * GET /api/medication-reminders/schedules/upcoming
 */
const getUpcomingDoses = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { date, hours } = req.query; // date=2026-01-26, hours=24

    const result = await medicationReminderService.getUpcomingDoses(patientId, date, hours);

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error in getUpcomingDoses:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลรอบยา'
    });
  }
};

/**
 * 10.3 ยืนยันการหยอดยา (Confirm)
 * POST /api/medication-reminders/logs/confirm
 */
const confirmDose = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { log_id, actual_datetime, notes } = req.body;

    const result = await medicationReminderService.confirmDose(patientId, log_id, actual_datetime, notes);

    return res.json({
      success: true,
      message: 'บันทึกการหยอดยาสำเร็จ',
      data: result
    });

  } catch (error) {
    console.error('Error in confirmDose:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการบันทึกการหยอดยา'
    });
  }
};

/**
 * 10.3 ข้ามรอบยา (Skip)
 * POST /api/medication-reminders/logs/skip
 */
const skipDose = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { log_id, skip_reason, skip_notes } = req.body;

    const result = await medicationReminderService.skipDose(patientId, log_id, skip_reason, skip_notes);

    return res.json({
      success: true,
      message: 'บันทึกการข้ามรอบยาสำเร็จ',
      data: result
    });

  } catch (error) {
    console.error('Error in skipDose:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการข้ามรอบยา'
    });
  }
};

/**
 * 10.3 เลื่อนเวลา (Snooze)
 * POST /api/medication-reminders/logs/snooze
 */
const snoozeDose = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { log_id, snooze_minutes } = req.body; // snooze_minutes: 5, 10, 15

    const result = await medicationReminderService.snoozeDose(patientId, log_id, snooze_minutes);

    return res.json({
      success: true,
      message: `เลื่อนการแจ้งเตือนไป ${snooze_minutes} นาที`,
      data: result
    });

  } catch (error) {
    console.error('Error in snoozeDose:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการเลื่อนเวลา'
    });
  }
};

/**
 * 10.4 ปรับเวลาหยอดยา (แบบครั้งเดียวหรือถาวร)
 * POST /api/medication-reminders/schedules/:scheduleId/adjust-time
 */
const adjustDoseTime = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { scheduleId } = req.params;
    const { adjustment_type, adjustment_minutes, adjustment_reason, apply_date } = req.body;
    // adjustment_type: 'one_time' | 'permanent'
    // adjustment_minutes: +30 (เลื่อนไป 30 นาที) หรือ -30 (เลื่อนกลับ 30 นาที)

    const result = await medicationReminderService.adjustDoseTime(
      patientId,
      scheduleId,
      adjustment_type,
      adjustment_minutes,
      adjustment_reason,
      apply_date
    );

    return res.json({
      success: true,
      message: adjustment_type === 'one_time' 
        ? 'ปรับเวลาสำหรับรอบนี้สำเร็จ' 
        : 'ปรับเวลาถาวรสำเร็จ',
      data: result
    });

  } catch (error) {
    console.error('Error in adjustDoseTime:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการปรับเวลา'
    });
  }
};

/**
 * 10.5 เปิด/ปิด Sleep Mode
 * PUT /api/medication-reminders/schedules/:scheduleId/sleep-mode
 */
const updateSleepMode = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { scheduleId } = req.params;
    const { sleep_mode_enabled, sleep_start_time, sleep_end_time, sleep_skip_dose } = req.body;

    const result = await medicationReminderService.updateSleepMode(
      patientId,
      scheduleId,
      sleep_mode_enabled,
      sleep_start_time,
      sleep_end_time,
      sleep_skip_dose
    );

    return res.json({
      success: true,
      message: sleep_mode_enabled ? 'เปิด Sleep Mode สำเร็จ' : 'ปิด Sleep Mode สำเร็จ',
      data: result
    });

  } catch (error) {
    console.error('Error in updateSleepMode:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดต Sleep Mode'
    });
  }
};

/**
 * 10.6 ตรวจสอบการชนกันของเวลาหยอดยา (Collision Detection)
 * POST /api/medication-reminders/schedules/check-collision
 */
const checkDoseCollision = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { proposed_time, date, exclude_schedule_id } = req.body;
    // proposed_time: "08:00:00"
    // date: "2026-01-26"

    const result = await medicationReminderService.checkDoseCollision(
      patientId,
      proposed_time,
      date,
      exclude_schedule_id
    );

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error in checkDoseCollision:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการตรวจสอบเวลาชนกัน'
    });
  }
};

/**
 * 10.7 ดูการตั้งค่าการแจ้งเตือน
 * GET /api/medication-reminders/notification-settings
 */
const getNotificationSettings = async (req, res) => {
  try {
    const patientId = req.user.userId;

    const result = await medicationReminderService.getNotificationSettings(patientId);

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error in getNotificationSettings:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงการตั้งค่า'
    });
  }
};

/**
 * 10.7 อัปเดตการตั้งค่าการแจ้งเตือน
 * PUT /api/medication-reminders/notification-settings
 */
const updateNotificationSettings = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const settings = req.body;

    const result = await medicationReminderService.updateNotificationSettings(patientId, settings);

    return res.json({
      success: true,
      message: 'อัปเดตการตั้งค่าสำเร็จ',
      data: result
    });

  } catch (error) {
    console.error('Error in updateNotificationSettings:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตการตั้งค่า'
    });
  }
};

/**
 * 10.8 ลงทะเบียน Push Notification Token
 * POST /api/medication-reminders/push-token
 */
const registerPushToken = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { expo_push_token, device_type, device_name } = req.body;

    const result = await medicationReminderService.registerPushToken(
      patientId,
      expo_push_token,
      device_type,
      device_name
    );

    return res.json({
      success: true,
      message: 'ลงทะเบียน Push Token สำเร็จ',
      data: result
    });

  } catch (error) {
    console.error('Error in registerPushToken:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการลงทะเบียน Push Token'
    });
  }
};

/**
 * 10.9 ดู Compliance Report (การปฏิบัติตามการหยอดยา)
 * GET /api/medication-reminders/compliance
 */
const getComplianceReport = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { start_date, end_date, schedule_id } = req.query;

    const result = await medicationReminderService.getComplianceReport(
      patientId,
      start_date,
      end_date,
      schedule_id
    );

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error in getComplianceReport:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงรายงาน'
    });
  }
};

/**
 * 10.10 ดูประวัติการแจ้งเตือน
 * GET /api/medication-reminders/notification-history
 */
const getNotificationHistory = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { start_date, end_date, notification_type, limit } = req.query;

    const result = await medicationReminderService.getNotificationHistory(
      patientId,
      start_date,
      end_date,
      notification_type,
      limit || 50
    );

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error in getNotificationHistory:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงประวัติ'
    });
  }
};

/**
 * ดูรายการ schedules ทั้งหมดของผู้ป่วย
 * GET /api/medication-reminders/schedules
 */
const getAllSchedules = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { is_active } = req.query;

    const result = await medicationReminderService.getAllSchedules(patientId, is_active);

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error in getAllSchedules:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
    });
  }
};

/**
 * ลบ schedule
 * DELETE /api/medication-reminders/schedules/:scheduleId
 */
const deleteSchedule = async (req, res) => {
  try {
    const patientId = req.user.userId;
    const { scheduleId } = req.params;

    await medicationReminderService.deleteSchedule(patientId, scheduleId);

    return res.json({
      success: true,
      message: 'ลบตารางเวลาสำเร็จ'
    });

  } catch (error) {
    console.error('Error in deleteSchedule:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการลบตารางเวลา'
    });
  }
};

module.exports = {
  createSchedule,
  updateSchedule,
  getUpcomingDoses,
  confirmDose,
  skipDose,
  snoozeDose,
  adjustDoseTime,
  updateSleepMode,
  checkDoseCollision,
  getNotificationSettings,
  updateNotificationSettings,
  registerPushToken,
  getComplianceReport,
  getNotificationHistory,
  getAllSchedules,
  deleteSchedule
};