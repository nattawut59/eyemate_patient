// services/medicationLog.service.js
const db = require('../config/database.config');

/**
 * Service สำหรับบันทึกการหยอดยา
 */
class MedicationLogService {
  
  /**
   * บันทึกการหยอดยา
   */
  async logMedicationUsage(patientId, logData) {
    let connection;
    
    try {
      console.log(`[LogService] Logging medication for patient: ${patientId}`);
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      // ตรวจสอบ reminder_id
      const [reminders] = await connection.query(
        `SELECT 
          mr.reminder_id,
          mr.medication_id,
          mr.reminder_time,
          mr.eye,
          mr.drops_count,
          mr.is_active,
          m.name as medication_name,
          pm.status as prescription_status
        FROM MedicationReminders mr
        INNER JOIN Medications m ON mr.medication_id = m.medication_id
        INNER JOIN PatientMedications pm ON mr.prescription_id = pm.prescription_id
        WHERE mr.reminder_id = ?
          AND mr.patient_id = ?`,
        [logData.reminder_id, patientId]
      );
      
      if (reminders.length === 0) {
        throw new Error('ไม่พบตารางเวลาแจ้งเตือนนี้ หรือไม่ใช่ของคุณ');
      }
      
      const reminderInfo = reminders[0];
      
      if (!reminderInfo.is_active) {
        throw new Error('ตารางเวลานี้ถูกปิดใช้งานแล้ว');
      }
      
      if (reminderInfo.prescription_status !== 'active') {
        throw new Error('ยาตัวนี้ถูกหยุดใช้แล้ว');
      }
      
      // สร้าง record_id
      const timestamp = Date.now().toString();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const recordId = `REC${timestamp}${random}`;
      
      // เวลาที่หยอดจริง
      const actualTime = logData.actual_time || new Date();
      
      // scheduled_time (วันนี้ + reminder_time)
      const today = new Date();
      const [hours, minutes, seconds] = reminderInfo.reminder_time.split(':');
      today.setHours(parseInt(hours));
      today.setMinutes(parseInt(minutes));
      today.setSeconds(parseInt(seconds));
      const scheduledTime = today;
      
      // บันทึกลง MedicationUsageRecords
      await connection.query(
        `INSERT INTO MedicationUsageRecords (
          record_id,
          patient_id,
          reminder_id,
          medication_id,
          scheduled_time,
          actual_time,
          status,
          eye,
          drops_count,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'taken', ?, ?, ?)`,
        [
          recordId,
          patientId,
          logData.reminder_id,
          reminderInfo.medication_id,
          scheduledTime,
          actualTime,
          reminderInfo.eye,
          reminderInfo.drops_count,
          logData.notes || null
        ]
      );
      
      await connection.commit();
      
      console.log(`[LogService] Success: ${recordId}`);
      
      return {
        record_id: recordId,
        medication_name: reminderInfo.medication_name,
        scheduled_time: scheduledTime,
        actual_time: actualTime,
        status: 'taken'
      };
      
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error('[LogService] Error:', error.message);
      throw error;
      
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
  
  /**
   * ดึงรายการยาที่ต้องหยอดวันนี้
   */
  async getTodayReminders(patientId) {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const dayMapping = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const currentDay = dayMapping[dayOfWeek];
      
      const [reminders] = await db.query(
        `SELECT 
          mr.reminder_id,
          mr.medication_id,
          mr.reminder_time,
          mr.eye,
          mr.drops_count,
          m.name as medication_name,
          m.generic_name,
          pm.dosage,
          pm.frequency,
          (SELECT COUNT(*) 
           FROM MedicationUsageRecords mur
           WHERE mur.reminder_id = mr.reminder_id
             AND DATE(mur.scheduled_time) = CURDATE()
             AND mur.status = 'taken'
          ) as already_taken
        FROM MedicationReminders mr
        INNER JOIN Medications m ON mr.medication_id = m.medication_id
        INNER JOIN PatientMedications pm ON mr.prescription_id = pm.prescription_id
        WHERE mr.patient_id = ?
          AND mr.is_active = 1
          AND pm.status = 'active'
          AND (
            mr.days_of_week IS NULL 
            OR mr.days_of_week LIKE ?
          )
          AND (mr.end_date IS NULL OR mr.end_date >= CURDATE())
        ORDER BY mr.reminder_time ASC`,
        [patientId, `%${currentDay}%`]
      );
      
      console.log(`[LogService] Found ${reminders.length} reminders for today`);
      
      // จัดกลุ่มตามรอบเวลา
      const grouped = {
        morning: [],
        afternoon: [],
        evening: []
      };
      
      reminders.forEach(reminder => {
        const hour = parseInt(reminder.reminder_time.split(':')[0]);
        let slot;
        
        if (hour >= 6 && hour < 12) {
          slot = 'morning';
        } else if (hour >= 12 && hour < 18) {
          slot = 'afternoon';
        } else {
          slot = 'evening';
        }
        
        grouped[slot].push({
          reminder_id: reminder.reminder_id,
          medication_id: reminder.medication_id,
          medication_name: reminder.medication_name,
          generic_name: reminder.generic_name,
          reminder_time: reminder.reminder_time,
          eye: reminder.eye,
          drops_count: reminder.drops_count,
          dosage: reminder.dosage,
          frequency: reminder.frequency,
          is_taken: reminder.already_taken > 0
        });
      });
      
      return grouped;
      
    } catch (error) {
      console.error('[LogService] Error getting reminders:', error.message);
      throw error;
    }
  }
}

module.exports = new MedicationLogService();