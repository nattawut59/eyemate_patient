// services/medicationReminder.service.js

const db = require('../config/database.config');
const { generateId } = require('../utils/idGenerator');
const { 
  calculateNextDoseTime, 
  isWithinSleepMode,
  getDoseTimesForDate,
  checkDoseSpacing
} = require('../utils/medicationHelper');

/**
 * 10.1 สร้าง Medication Schedule
 */
const createSchedule = async (patientId, scheduleData) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      prescription_id,
      medication_id,
      frequency_type, // 'fixed_times' | 'interval' | 'custom'
      interval_hours, // ถ้า frequency_type = 'interval'
      times_per_day = 1,
      dose_times = [], // [{dose_time: '08:00:00', dose_label: 'เช้า'}]
      calculate_from_actual = 1,
      dose_spacing_minutes = 5,
      start_date,
      end_date = null,
      sleep_mode_enabled = 0,
      sleep_start_time = '22:00:00',
      sleep_end_time = '06:00:00',
      sleep_skip_dose = 1,
      reminder_advance_minutes = 5,
      notes = null
    } = scheduleData;

    // ตรวจสอบว่า prescription และ medication ถูกต้อง
    const [prescription] = await connection.query(
      `SELECT pm.prescription_id, pm.patient_id, pm.medication_id, pm.eye, pm.status
       FROM PatientMedications pm
       WHERE pm.prescription_id = ? AND pm.patient_id = ? AND pm.status = 'active'`,
      [prescription_id, patientId]
    );

    if (prescription.length === 0) {
      throw new Error('ไม่พบใบสั่งยาหรือใบสั่งยาหมดอายุแล้ว');
    }

    // สร้าง schedule_id
    const scheduleId = generateId('SCHED');

    // Insert MedicationSchedules
    await connection.query(
      `INSERT INTO MedicationSchedules (
        schedule_id, patient_id, prescription_id, medication_id,
        frequency_type, interval_hours, times_per_day,
        calculate_from_actual, dose_spacing_minutes,
        start_date, end_date,
        sleep_mode_enabled, sleep_start_time, sleep_end_time, sleep_skip_dose,
        reminder_advance_minutes, is_active, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        scheduleId, patientId, prescription_id, medication_id,
        frequency_type, interval_hours, times_per_day,
        calculate_from_actual, dose_spacing_minutes,
        start_date, end_date,
        sleep_mode_enabled, sleep_start_time, sleep_end_time, sleep_skip_dose,
        reminder_advance_minutes, notes, patientId
      ]
    );

    // ถ้า frequency_type = 'fixed_times' → สร้าง dose_times
    if (frequency_type === 'fixed_times' && dose_times.length > 0) {
      for (let i = 0; i < dose_times.length; i++) {
        const doseTimeId = generateId('DOSE');
        const { dose_time, dose_label } = dose_times[i];

        await connection.query(
          `INSERT INTO MedicationDoseTimes (
            dose_time_id, schedule_id, dose_time, dose_label, dose_order, is_active
          ) VALUES (?, ?, ?, ?, ?, 1)`,
          [doseTimeId, scheduleId, dose_time, dose_label || `รอบที่ ${i + 1}`, i + 1]
        );
      }
    }

    // สร้าง MedicationLogs สำหรับ 7 วันข้างหน้า
    await generateUpcomingLogs(connection, scheduleId, patientId, medication_id, start_date, 7);

    await connection.commit();

    return {
      schedule_id: scheduleId,
      message: 'สร้างตารางเวลาสำเร็จ'
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * สร้าง MedicationLogs ล่วงหน้า
 */
const generateUpcomingLogs = async (connection, scheduleId, patientId, medicationId, startDate, days) => {
  // ดึงข้อมูล schedule
  const [schedules] = await connection.query(
    `SELECT * FROM MedicationSchedules WHERE schedule_id = ?`,
    [scheduleId]
  );

  if (schedules.length === 0) return;

  const schedule = schedules[0];

  // ดึง dose_times (ถ้า frequency_type = 'fixed_times')
  const [doseTimes] = await connection.query(
    `SELECT * FROM MedicationDoseTimes 
     WHERE schedule_id = ? AND is_active = 1
     ORDER BY dose_order`,
    [scheduleId]
  );

  const start = new Date(startDate);

  for (let day = 0; day < days; day++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + day);
    const dateStr = currentDate.toISOString().split('T')[0];

    if (schedule.frequency_type === 'fixed_times') {
      // สร้าง log ตาม dose_times
      for (const doseTime of doseTimes) {
        const scheduledDatetime = `${dateStr} ${doseTime.dose_time}`;

        // ตรวจสอบว่าอยู่ใน sleep mode หรือไม่
        const inSleepMode = isWithinSleepMode(
          doseTime.dose_time,
          schedule.sleep_mode_enabled,
          schedule.sleep_start_time,
          schedule.sleep_end_time
        );

        if (schedule.sleep_skip_dose && inSleepMode) {
          continue; // ข้ามรอบนี้
        }

        const logId = generateId('LOG');

        await connection.query(
          `INSERT INTO MedicationLogs (
            log_id, schedule_id, dose_time_id, patient_id, medication_id,
            scheduled_datetime, status, dose_sequence, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, NOW())`,
          [logId, scheduleId, doseTime.dose_time_id, patientId, medicationId, scheduledDatetime]
        );
      }

    } else if (schedule.frequency_type === 'interval') {
      // สร้าง log ตามช่วงเวลา (interval_hours)
      const timesPerDay = Math.floor(24 / schedule.interval_hours);
      let currentTime = new Date(`${dateStr} 08:00:00`); // เริ่มที่ 08:00

      for (let i = 0; i < timesPerDay; i++) {
        const timeStr = currentTime.toTimeString().split(' ')[0];
        const scheduledDatetime = `${dateStr} ${timeStr}`;

        const inSleepMode = isWithinSleepMode(
          timeStr,
          schedule.sleep_mode_enabled,
          schedule.sleep_start_time,
          schedule.sleep_end_time
        );

        if (schedule.sleep_skip_dose && inSleepMode) {
          currentTime.setHours(currentTime.getHours() + schedule.interval_hours);
          continue;
        }

        const logId = generateId('LOG');

        await connection.query(
          `INSERT INTO MedicationLogs (
            log_id, schedule_id, patient_id, medication_id,
            scheduled_datetime, status, dose_sequence, created_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW())`,
          [logId, scheduleId, patientId, medicationId, scheduledDatetime, i + 1]
        );

        currentTime.setHours(currentTime.getHours() + schedule.interval_hours);
      }
    }
  }
};

/**
 * 10.1 อัปเดต Medication Schedule
 */
const updateSchedule = async (patientId, scheduleId, scheduleData) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ตรวจสอบว่า schedule เป็นของ patient นี้
    const [schedules] = await connection.query(
      `SELECT * FROM MedicationSchedules WHERE schedule_id = ? AND patient_id = ?`,
      [scheduleId, patientId]
    );

    if (schedules.length === 0) {
      throw new Error('ไม่พบตารางเวลาหรือคุณไม่มีสิทธิ์เข้าถึง');
    }

    const {
      times_per_day,
      dose_spacing_minutes,
      end_date,
      sleep_mode_enabled,
      sleep_start_time,
      sleep_end_time,
      sleep_skip_dose,
      reminder_advance_minutes,
      is_active,
      notes
    } = scheduleData;

    // อัปเดต schedule
    await connection.query(
      `UPDATE MedicationSchedules SET
        times_per_day = COALESCE(?, times_per_day),
        dose_spacing_minutes = COALESCE(?, dose_spacing_minutes),
        end_date = COALESCE(?, end_date),
        sleep_mode_enabled = COALESCE(?, sleep_mode_enabled),
        sleep_start_time = COALESCE(?, sleep_start_time),
        sleep_end_time = COALESCE(?, sleep_end_time),
        sleep_skip_dose = COALESCE(?, sleep_skip_dose),
        reminder_advance_minutes = COALESCE(?, reminder_advance_minutes),
        is_active = COALESCE(?, is_active),
        notes = COALESCE(?, notes),
        updated_at = NOW()
       WHERE schedule_id = ?`,
      [
        times_per_day, dose_spacing_minutes, end_date,
        sleep_mode_enabled, sleep_start_time, sleep_end_time, sleep_skip_dose,
        reminder_advance_minutes, is_active, notes,
        scheduleId
      ]
    );

    await connection.commit();

    return {
      schedule_id: scheduleId,
      message: 'อัปเดตตารางเวลาสำเร็จ'
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 10.2 ดูรอบยาที่จะถึง
 */
const getUpcomingDoses = async (patientId, date, hours = 24) => {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const endDatetime = new Date();
    endDatetime.setHours(endDatetime.getHours() + parseInt(hours));
    const endDatetimeStr = endDatetime.toISOString().slice(0, 19).replace('T', ' ');

    const [logs] = await db.query(
      `SELECT 
        ml.log_id,
        ml.schedule_id,
        ml.scheduled_datetime,
        ml.status,
        ml.snooze_until,
        ml.snooze_count,
        ml.dose_sequence,
        m.name AS medication_name,
        m.generic_name,
        pm.eye,
        ms.frequency_type,
        ms.times_per_day,
        ms.dose_spacing_minutes,
        dt.dose_label,
        dt.dose_time
       FROM MedicationLogs ml
       JOIN MedicationSchedules ms ON ml.schedule_id = ms.schedule_id
       JOIN Medications m ON ml.medication_id = m.medication_id
       JOIN PatientMedications pm ON ms.prescription_id = pm.prescription_id
       LEFT JOIN MedicationDoseTimes dt ON ml.dose_time_id = dt.dose_time_id
       WHERE ml.patient_id = ?
         AND ml.scheduled_datetime <= ?
         AND ml.status IN ('pending', 'snoozed')
         AND ms.is_active = 1
       ORDER BY ml.scheduled_datetime ASC`,
      [patientId, endDatetimeStr]
    );

    return {
      upcoming_doses: logs,
      total_count: logs.length
    };

  } catch (error) {
    throw error;
  }
};

/**
 * 10.3 ยืนยันการหยอดยา
 */
const confirmDose = async (patientId, logId, actualDatetime, notes = null) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ตรวจสอบ log
    const [logs] = await connection.query(
      `SELECT ml.*, ms.dose_spacing_minutes, ms.calculate_from_actual
       FROM MedicationLogs ml
       JOIN MedicationSchedules ms ON ml.schedule_id = ms.schedule_id
       WHERE ml.log_id = ? AND ml.patient_id = ?`,
      [logId, patientId]
    );

    if (logs.length === 0) {
      throw new Error('ไม่พบรายการหยอดยา');
    }

    const log = logs[0];

    if (log.status === 'completed') {
      throw new Error('รายการนี้ถูกบันทึกแล้ว');
    }

    const actual = actualDatetime || new Date().toISOString().slice(0, 19).replace('T', ' ');

    // อัปเดตสถานะ
    await connection.query(
      `UPDATE MedicationLogs SET
        actual_datetime = ?,
        status = 'completed',
        notes = COALESCE(?, notes),
        updated_at = NOW()
       WHERE log_id = ?`,
      [actual, notes, logId]
    );

    // ถ้าเป็นยาที่ต้องหยอดหลายตัวในรอบเดียว (dose_sequence)
    // ตรวจสอบว่ายังมีตัวอื่นที่ต้องรอหรือไม่
    if (log.dose_spacing_minutes > 0 && log.dose_sequence > 1) {
      // เริ่มนับ timer รอ dose_spacing_minutes
      const waitStarted = new Date(actual);
      const waitCompleted = new Date(waitStarted);
      waitCompleted.setMinutes(waitCompleted.getMinutes() + log.dose_spacing_minutes);

      await connection.query(
        `UPDATE MedicationLogs SET
          wait_started_at = ?,
          wait_completed_at = ?
         WHERE log_id = ?`,
        [waitStarted.toISOString().slice(0, 19).replace('T', ' '),
         waitCompleted.toISOString().slice(0, 19).replace('T', ' '),
         logId]
      );
    }

    // ถ้า calculate_from_actual = 1 → คำนวณรอบถัดไปจากเวลาที่หยอดจริง
    if (log.calculate_from_actual && log.dose_sequence === log.times_per_day) {
      // สร้างรอบถัดไป
      await generateNextDose(connection, log, actual);
    }

    await connection.commit();

    return {
      log_id: logId,
      message: 'บันทึกการหยอดยาสำเร็จ',
      actual_datetime: actual
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * สร้างรอบถัดไป (สำหรับ interval mode)
 */
const generateNextDose = async (connection, currentLog, actualDatetime) => {
  const [schedules] = await connection.query(
    `SELECT * FROM MedicationSchedules WHERE schedule_id = ?`,
    [currentLog.schedule_id]
  );

  if (schedules.length === 0) return;

  const schedule = schedules[0];

  if (schedule.frequency_type !== 'interval') return;

  // คำนวณเวลาถัดไป
  const nextTime = new Date(actualDatetime);
  nextTime.setHours(nextTime.getHours() + schedule.interval_hours);

  const nextDatetime = nextTime.toISOString().slice(0, 19).replace('T', ' ');

  const logId = generateId('LOG');

  await connection.query(
    `INSERT INTO MedicationLogs (
      log_id, schedule_id, patient_id, medication_id,
      scheduled_datetime, status, dose_sequence, created_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 1, NOW())`,
    [logId, schedule.schedule_id, currentLog.patient_id, currentLog.medication_id, nextDatetime]
  );
};

/**
 * 10.3 ข้ามรอบยา
 */
const skipDose = async (patientId, logId, skipReason, skipNotes = null) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [logs] = await connection.query(
      `SELECT * FROM MedicationLogs WHERE log_id = ? AND patient_id = ?`,
      [logId, patientId]
    );

    if (logs.length === 0) {
      throw new Error('ไม่พบรายการหยอดยา');
    }

    const log = logs[0];

    if (log.status === 'completed') {
      throw new Error('รายการนี้ถูกบันทึกแล้ว ไม่สามารถข้ามได้');
    }

    await connection.query(
      `UPDATE MedicationLogs SET
        status = 'skipped',
        skip_reason = ?,
        skip_notes = ?,
        updated_at = NOW()
       WHERE log_id = ?`,
      [skipReason, skipNotes, logId]
    );

    await connection.commit();

    return {
      log_id: logId,
      message: 'บันทึกการข้ามรอบยาสำเร็จ'
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 10.3 เลื่อนเวลา (Snooze)
 */
const snoozeDose = async (patientId, logId, snoozeMinutes) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ดึงการตั้งค่า notification
    const [settings] = await connection.query(
      `SELECT max_snooze_count FROM NotificationSettings WHERE patient_id = ?`,
      [patientId]
    );

    const maxSnooze = settings.length > 0 ? settings[0].max_snooze_count : 2;

    const [logs] = await connection.query(
      `SELECT * FROM MedicationLogs WHERE log_id = ? AND patient_id = ?`,
      [logId, patientId]
    );

    if (logs.length === 0) {
      throw new Error('ไม่พบรายการหยอดยา');
    }

    const log = logs[0];

    if (log.snooze_count >= maxSnooze) {
      throw new Error(`สามารถเลื่อนได้สูงสุด ${maxSnooze} ครั้งเท่านั้น`);
    }

    const snoozeUntil = new Date();
    snoozeUntil.setMinutes(snoozeUntil.getMinutes() + snoozeMinutes);
    const snoozeUntilStr = snoozeUntil.toISOString().slice(0, 19).replace('T', ' ');

    await connection.query(
      `UPDATE MedicationLogs SET
        status = 'snoozed',
        snooze_count = snooze_count + 1,
        snooze_until = ?,
        updated_at = NOW()
       WHERE log_id = ?`,
      [snoozeUntilStr, logId]
    );

    await connection.commit();

    return {
      log_id: logId,
      snooze_until: snoozeUntilStr,
      message: `เลื่อนการแจ้งเตือนไป ${snoozeMinutes} นาที`
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 10.4 ปรับเวลาหยอดยา
 */
const adjustDoseTime = async (
  patientId,
  scheduleId,
  adjustmentType, // 'one_time' | 'permanent'
  adjustmentMinutes,
  adjustmentReason,
  applyDate = null
) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [schedules] = await connection.query(
      `SELECT * FROM MedicationSchedules WHERE schedule_id = ? AND patient_id = ?`,
      [scheduleId, patientId]
    );

    if (schedules.length === 0) {
      throw new Error('ไม่พบตารางเวลา');
    }

    if (adjustmentType === 'one_time') {
      // ปรับเวลาเฉพาะรอบนั้น
      const targetDate = applyDate || new Date().toISOString().split('T')[0];

      await connection.query(
        `UPDATE MedicationLogs SET
          is_adjusted = 1,
          adjustment_type = 'one_time',
          adjustment_minutes = ?,
          adjustment_reason = ?,
          scheduled_datetime = DATE_ADD(scheduled_datetime, INTERVAL ? MINUTE),
          updated_at = NOW()
         WHERE schedule_id = ?
           AND DATE(scheduled_datetime) = ?
           AND status = 'pending'`,
        [adjustmentMinutes, adjustmentReason, adjustmentMinutes, scheduleId, targetDate]
      );

    } else if (adjustmentType === 'permanent') {
      // แก้ไขตารางหลักและ dose_times
      const [doseTimes] = await connection.query(
        `SELECT * FROM MedicationDoseTimes WHERE schedule_id = ?`,
        [scheduleId]
      );

      for (const doseTime of doseTimes) {
        const oldTime = doseTime.dose_time;
        const [hours, minutes, seconds] = oldTime.split(':').map(Number);
        const newDate = new Date();
        newDate.setHours(hours, minutes + adjustmentMinutes, seconds);
        const newTime = newDate.toTimeString().split(' ')[0];

        await connection.query(
          `UPDATE MedicationDoseTimes SET dose_time = ? WHERE dose_time_id = ?`,
          [newTime, doseTime.dose_time_id]
        );
      }

      // อัปเดต logs ในอนาคต
      await connection.query(
        `UPDATE MedicationLogs SET
          is_adjusted = 1,
          adjustment_type = 'permanent',
          adjustment_minutes = ?,
          adjustment_reason = ?,
          scheduled_datetime = DATE_ADD(scheduled_datetime, INTERVAL ? MINUTE),
          updated_at = NOW()
         WHERE schedule_id = ?
           AND status = 'pending'
           AND scheduled_datetime >= NOW()`,
        [adjustmentMinutes, adjustmentReason, adjustmentMinutes, scheduleId]
      );
    }

    await connection.commit();

    return {
      schedule_id: scheduleId,
      adjustment_type: adjustmentType,
      adjustment_minutes: adjustmentMinutes,
      message: 'ปรับเวลาสำเร็จ'
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 10.5 อัปเดต Sleep Mode
 */
const updateSleepMode = async (
  patientId,
  scheduleId,
  sleepModeEnabled,
  sleepStartTime,
  sleepEndTime,
  sleepSkipDose
) => {
  try {
    await db.query(
      `UPDATE MedicationSchedules SET
        sleep_mode_enabled = ?,
        sleep_start_time = ?,
        sleep_end_time = ?,
        sleep_skip_dose = ?,
        updated_at = NOW()
       WHERE schedule_id = ? AND patient_id = ?`,
      [sleepModeEnabled, sleepStartTime, sleepEndTime, sleepSkipDose, scheduleId, patientId]
    );

    return {
      schedule_id: scheduleId,
      sleep_mode_enabled: sleepModeEnabled,
      message: sleepModeEnabled ? 'เปิด Sleep Mode สำเร็จ' : 'ปิด Sleep Mode สำเร็จ'
    };

  } catch (error) {
    throw error;
  }
};

/**
 * 10.6 ตรวจสอบการชนกันของเวลา
 */
const checkDoseCollision = async (patientId, proposedTime, date, excludeScheduleId = null) => {
  try {
    let query = `
      SELECT 
        ms.schedule_id,
        dt.dose_time,
        dt.dose_label,
        m.name AS medication_name,
        ms.dose_spacing_minutes
      FROM MedicationSchedules ms
      JOIN MedicationDoseTimes dt ON ms.schedule_id = dt.schedule_id
      JOIN Medications m ON ms.medication_id = m.medication_id
      WHERE ms.patient_id = ?
        AND ms.is_active = 1
        AND dt.is_active = 1
    `;

    const params = [patientId];

    if (excludeScheduleId) {
      query += ` AND ms.schedule_id != ?`;
      params.push(excludeScheduleId);
    }

    const [existingDoses] = await db.query(query, params);

    const collisions = [];
    const proposedDate = new Date(`2000-01-01 ${proposedTime}`);

    for (const dose of existingDoses) {
      const existingDate = new Date(`2000-01-01 ${dose.dose_time}`);
      const diffMinutes = Math.abs((proposedDate - existingDate) / 60000);

      if (diffMinutes < dose.dose_spacing_minutes) {
        collisions.push({
          medication_name: dose.medication_name,
          existing_time: dose.dose_time,
          dose_label: dose.dose_label,
          required_spacing: dose.dose_spacing_minutes,
          actual_spacing: Math.floor(diffMinutes)
        });
      }
    }

    return {
      has_collision: collisions.length > 0,
      collisions,
      proposed_time: proposedTime,
      message: collisions.length > 0 
        ? 'พบเวลาที่ชนกัน กรุณาเว้นช่วงเวลาตามที่กำหนด' 
        : 'ไม่พบเวลาที่ชนกัน'
    };

  } catch (error) {
    throw error;
  }
};

/**
 * 10.7 ดูการตั้งค่าการแจ้งเตือน
 */
const getNotificationSettings = async (patientId) => {
  try {
    const [settings] = await db.query(
      `SELECT * FROM NotificationSettings WHERE patient_id = ?`,
      [patientId]
    );

    if (settings.length === 0) {
      // สร้าง default settings
      const settingId = generateId('NOTSET');
      await db.query(
        `INSERT INTO NotificationSettings (
          setting_id, patient_id, push_enabled, sound_enabled, vibration_enabled,
          remind_before_minutes, snooze_enabled, snooze_duration_minutes, max_snooze_count
        ) VALUES (?, ?, 1, 1, 1, 5, 1, 10, 2)`,
        [settingId, patientId]
      );

      const [newSettings] = await db.query(
        `SELECT * FROM NotificationSettings WHERE setting_id = ?`,
        [settingId]
      );

      return newSettings[0];
    }

    return settings[0];

  } catch (error) {
    throw error;
  }
};

/**
 * 10.7 อัปเดตการตั้งค่าการแจ้งเตือน
 */
const updateNotificationSettings = async (patientId, settings) => {
  try {
    const {
      push_enabled,
      sound_enabled,
      vibration_enabled,
      remind_before_minutes,
      snooze_enabled,
      snooze_duration_minutes,
      max_snooze_count,
      persistent_notification
    } = settings;

    await db.query(
      `UPDATE NotificationSettings SET
        push_enabled = COALESCE(?, push_enabled),
        sound_enabled = COALESCE(?, sound_enabled),
        vibration_enabled = COALESCE(?, vibration_enabled),
        remind_before_minutes = COALESCE(?, remind_before_minutes),
        snooze_enabled = COALESCE(?, snooze_enabled),
        snooze_duration_minutes = COALESCE(?, snooze_duration_minutes),
        max_snooze_count = COALESCE(?, max_snooze_count),
        persistent_notification = COALESCE(?, persistent_notification),
        updated_at = NOW()
       WHERE patient_id = ?`,
      [
        push_enabled, sound_enabled, vibration_enabled,
        remind_before_minutes, snooze_enabled, snooze_duration_minutes,
        max_snooze_count, persistent_notification, patientId
      ]
    );

    const [updated] = await db.query(
      `SELECT * FROM NotificationSettings WHERE patient_id = ?`,
      [patientId]
    );

    return updated[0];

  } catch (error) {
    throw error;
  }
};

/**
 * 10.8 ลงทะเบียน Push Token
 */
const registerPushToken = async (patientId, expoPushToken, deviceType, deviceName) => {
  try {
    // ตรวจสอบว่ามี token นี้อยู่แล้วหรือไม่
    const [existing] = await db.query(
      `SELECT * FROM PushTokens WHERE expo_push_token = ?`,
      [expoPushToken]
    );

    if (existing.length > 0) {
      // อัปเดต
      await db.query(
        `UPDATE PushTokens SET
          is_active = 1,
          device_name = ?,
          last_used_at = NOW()
         WHERE expo_push_token = ?`,
        [deviceName, expoPushToken]
      );

      return {
        token_id: existing[0].token_id,
        message: 'อัปเดต Push Token สำเร็จ'
      };
    }

    // สร้างใหม่
    const tokenId = generateId('TOKEN');

    await db.query(
      `INSERT INTO PushTokens (
        token_id, patient_id, expo_push_token, device_type, device_name, is_active
      ) VALUES (?, ?, ?, ?, ?, 1)`,
      [tokenId, patientId, expoPushToken, deviceType, deviceName]
    );

    return {
      token_id: tokenId,
      message: 'ลงทะเบียน Push Token สำเร็จ'
    };

  } catch (error) {
    throw error;
  }
};

/**
 * 10.9 Compliance Report
 */
const getComplianceReport = async (patientId, startDate, endDate, scheduleId = null) => {
  try {
    let query = `
      SELECT 
        ml.status,
        COUNT(*) as count,
        ms.schedule_id,
        m.name AS medication_name
      FROM MedicationLogs ml
      JOIN MedicationSchedules ms ON ml.schedule_id = ms.schedule_id
      JOIN Medications m ON ml.medication_id = m.medication_id
      WHERE ml.patient_id = ?
        AND DATE(ml.scheduled_datetime) BETWEEN ? AND ?
    `;

    const params = [patientId, startDate, endDate];

    if (scheduleId) {
      query += ` AND ml.schedule_id = ?`;
      params.push(scheduleId);
    }

    query += ` GROUP BY ml.status, ms.schedule_id, m.name`;

    const [results] = await db.query(query, params);

    // คำนวณ compliance rate
    const totalDoses = results.reduce((sum, r) => sum + r.count, 0);
    const completedDoses = results.find(r => r.status === 'completed')?.count || 0;
    const skippedDoses = results.find(r => r.status === 'skipped')?.count || 0;
    const missedDoses = results.find(r => r.status === 'missed')?.count || 0;

    const complianceRate = totalDoses > 0 ? ((completedDoses / totalDoses) * 100).toFixed(2) : 0;

    return {
      period: {
        start_date: startDate,
        end_date: endDate
      },
      summary: {
        total_doses: totalDoses,
        completed: completedDoses,
        skipped: skippedDoses,
        missed: missedDoses,
        pending: results.find(r => r.status === 'pending')?.count || 0,
        compliance_rate: parseFloat(complianceRate)
      },
      by_medication: results
    };

  } catch (error) {
    throw error;
  }
};

/**
 * 10.10 ประวัติการแจ้งเตือน
 */
const getNotificationHistory = async (patientId, startDate, endDate, notificationType, limit) => {
  try {
    let query = `
      SELECT * FROM NotificationHistory
      WHERE patient_id = ?
    `;

    const params = [patientId];

    if (startDate && endDate) {
      query += ` AND DATE(sent_at) BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    if (notificationType) {
      query += ` AND notification_type = ?`;
      params.push(notificationType);
    }

    query += ` ORDER BY sent_at DESC LIMIT ?`;
    params.push(parseInt(limit));

    const [history] = await db.query(query, params);

    return {
      notifications: history,
      total_count: history.length
    };

  } catch (error) {
    throw error;
  }
};

/**
 * ดูรายการ schedules ทั้งหมด
 */
const getAllSchedules = async (patientId, isActive = null) => {
  try {
    let query = `
      SELECT 
        ms.*,
        m.name AS medication_name,
        m.generic_name,
        pm.eye,
        pm.dosage,
        pm.frequency AS prescription_frequency
      FROM MedicationSchedules ms
      JOIN Medications m ON ms.medication_id = m.medication_id
      JOIN PatientMedications pm ON ms.prescription_id = pm.prescription_id
      WHERE ms.patient_id = ?
    `;

    const params = [patientId];

    if (isActive !== null) {
      query += ` AND ms.is_active = ?`;
      params.push(isActive);
    }

    query += ` ORDER BY ms.created_at DESC`;

    const [schedules] = await db.query(query, params);

    // ดึง dose_times สำหรับแต่ละ schedule
    for (const schedule of schedules) {
      const [doseTimes] = await db.query(
        `SELECT * FROM MedicationDoseTimes 
         WHERE schedule_id = ? AND is_active = 1
         ORDER BY dose_order`,
        [schedule.schedule_id]
      );
      schedule.dose_times = doseTimes;
    }

    return {
      schedules,
      total_count: schedules.length
    };

  } catch (error) {
    throw error;
  }
};

/**
 * ลบ schedule
 */
const deleteSchedule = async (patientId, scheduleId) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ตรวจสอบว่าเป็นของ patient นี้
    const [schedules] = await connection.query(
      `SELECT * FROM MedicationSchedules WHERE schedule_id = ? AND patient_id = ?`,
      [scheduleId, patientId]
    );

    if (schedules.length === 0) {
      throw new Error('ไม่พบตารางเวลาหรือคุณไม่มีสิทธิ์ลบ');
    }

    // ลบ (cascade จะลบ dose_times และ logs ด้วย)
    await connection.query(
      `DELETE FROM MedicationSchedules WHERE schedule_id = ?`,
      [scheduleId]
    );

    await connection.commit();

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
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