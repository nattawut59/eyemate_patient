// services/medication.service.js
const db = require('../config/database.config');

class MedicationService {

  // ============================================
  // getMedicationCompliance — ดึงข้อมูล compliance วันนี้
  // ============================================
  async getMedicationCompliance(patientId, date) {
    try {
      console.log(`[Service] Getting compliance for patient: ${patientId}, date: ${date}`);

      // ✅ ดึงจาก MedicationLogs (ระบบใหม่) แทน MedicationReminders (เก่า)
      const logs = await this.getMedicationLogs(patientId, date);
      const timeSlots = this.categorizeByTimeSlot(logs);
      const overallCompliance = this.calculateOverallCompliance(timeSlots);

      return { date, overall_compliance: overallCompliance, ...timeSlots };
    } catch (error) {
      console.error('[Service] Error in getMedicationCompliance:', error.message);
      throw error;
    }
  }

  // ============================================
  // getMedicationLogs — ดึง MedicationLogs + join ตารางที่เกี่ยวข้อง
  // ============================================
  async getMedicationLogs(patientId, date) {
    try {
      const [logs] = await db.query(
        `SELECT
          ml.log_id,
          ml.medication_id,
          ml.scheduled_datetime,
          ml.actual_datetime,
          ml.status,
          ml.snooze_until,
          ml.notes,
          TIME(CONVERT_TZ(ml.scheduled_datetime, '+00:00', '+07:00')) AS scheduled_time,
          m.name  AS medication_name,
          m.generic_name,
          pm.eye,
          pm.dosage,
          dt.dose_label,
          dt.dose_order
        FROM MedicationLogs ml
        JOIN MedicationSchedules ms  ON ml.schedule_id   = ms.schedule_id
        JOIN Medications m           ON ml.medication_id  = m.medication_id
        JOIN PatientMedications pm   ON ms.prescription_id = pm.prescription_id
        LEFT JOIN MedicationDoseTimes dt ON ml.dose_time_id = dt.dose_time_id
        WHERE ml.patient_id = ?
          AND DATE(CONVERT_TZ(ml.scheduled_datetime, '+00:00', '+07:00')) = ?
          AND ms.is_active = 1
          AND ml.status IN ('pending', 'completed', 'skipped', 'snoozed', 'missed')
        ORDER BY ml.scheduled_datetime ASC`,
        [patientId, date]
      );

      console.log(`[Service] Found ${logs.length} logs for ${date}`);
      return logs;
    } catch (error) {
      console.error('[Service] Error getting medication logs:', error.message);
      throw error;
    }
  }

  // ============================================
  // categorizeByTimeSlot — แบ่งกลุ่มตามช่วงเวลา เช้า/เที่ยง/เย็น
  // ============================================
  categorizeByTimeSlot(logs) {
    const slots = {
      morning:   { medications: [], scheduled_count: 0, completed_count: 0 },
      afternoon: { medications: [], scheduled_count: 0, completed_count: 0 },
      evening:   { medications: [], scheduled_count: 0, completed_count: 0 },
    };

    logs.forEach(log => {
      const timeStr = log.scheduled_time || '00:00:00';
      const hour = parseInt(timeStr.split(':')[0]);

      let slot;
      if (hour >= 6 && hour < 12)       slot = 'morning';
      else if (hour >= 12 && hour < 18) slot = 'afternoon';
      else                               slot = 'evening';

      slots[slot].medications.push({
        // ✅ ใช้ log_id เป็น reminder_id — frontend เอาไปกด "หยอดแล้ว"
        reminder_id:     log.log_id,
        log_id:          log.log_id,
        medication_id:   log.medication_id,
        medication_name: log.medication_name,
        generic_name:    log.generic_name,
        scheduled_time:  timeStr,
        eye:             log.eye,
        dosage:          log.dosage,
        dose_label:      log.dose_label,
        status:          log.status,
        actual_time:     log.actual_datetime || null,
      });

      slots[slot].scheduled_count++;
      if (log.status === 'completed') slots[slot].completed_count++;
    });

    // คำนวณ status และ compliance_rate แต่ละ slot
    Object.keys(slots).forEach(slotName => {
      const slot = slots[slotName];
      if (slot.scheduled_count === 0)
        slot.status = 'no_medication';
      else if (slot.completed_count === slot.scheduled_count)
        slot.status = 'completed';
      else if (slot.completed_count > 0)
        slot.status = 'partial';
      else
        slot.status = 'missed';

      slot.compliance_rate = slot.scheduled_count > 0
        ? parseFloat(((slot.completed_count / slot.scheduled_count) * 100).toFixed(2))
        : 0;
    });

    return slots;
  }

  // ============================================
  // calculateOverallCompliance
  // ============================================
  calculateOverallCompliance(timeSlots) {
    let totalScheduled = 0, totalCompleted = 0;
    Object.values(timeSlots).forEach(slot => {
      totalScheduled += slot.scheduled_count;
      totalCompleted += slot.completed_count;
    });
    if (totalScheduled === 0) return 0;
    return parseFloat(((totalCompleted / totalScheduled) * 100).toFixed(2));
  }

  // ============================================
  // getComplianceHistory — ประวัติย้อนหลัง N วัน
  // ============================================
  async getComplianceHistory(patientId, days = 7) {
    try {
      const history = [];
      const today = new Date();

      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        const compliance = await this.getMedicationCompliance(patientId, dateString);
        history.push({
          date: dateString,
          overall_compliance: compliance.overall_compliance,
          morning_status:   compliance.morning.status,
          afternoon_status: compliance.afternoon.status,
          evening_status:   compliance.evening.status,
        });
      }

      return history.reverse();
    } catch (error) {
      console.error('[Service] Error getting compliance history:', error.message);
      throw error;
    }
  }

  // ============================================
  // getPatientMedications — รายการยาทั้งหมด
  // ============================================
  async getPatientMedications(patientId) {
    try {
      const [medications] = await db.query(
        `SELECT
          pm.prescription_id AS patient_medication_id,
          pm.medication_id,
          m.name AS medication_name,
          m.generic_name,
          m.strength,
          m.form AS dosage_form,
          pm.eye,
          pm.dosage,
          pm.frequency,
          pm.duration,
          pm.special_instructions AS instructions,
          pm.status,
          pm.last_dispensed_date AS start_date,
          DATE_ADD(pm.last_dispensed_date, INTERVAL
            CAST(SUBSTRING_INDEX(pm.duration, ' ', 1) AS UNSIGNED) DAY
          ) AS end_date,
          pm.quantity_dispensed,
          pm.refills,
          pm.created_at,
          d.first_name AS doctor_first_name,
          d.last_name  AS doctor_last_name
        FROM PatientMedications pm
        INNER JOIN Medications m ON pm.medication_id = m.medication_id
        LEFT JOIN DoctorProfiles d ON pm.doctor_id = d.doctor_id
        WHERE pm.patient_id = ?
          AND pm.status = 'active'
        ORDER BY pm.created_at DESC`,
        [patientId]
      );

      const result = medications.map(med => {
        let timesPerDay = 0;
        const freq = (med.frequency || '').toLowerCase();
        if (freq.includes('1') || freq.includes('once'))  timesPerDay = 1;
        else if (freq.includes('2') || freq.includes('twice')) timesPerDay = 2;
        else if (freq.includes('3') || freq.includes('three')) timesPerDay = 3;
        else if (freq.includes('4') || freq.includes('four'))  timesPerDay = 4;

        return {
          patient_medication_id: med.patient_medication_id,
          medication_id:   med.medication_id,
          medication_name: med.medication_name,
          generic_name:    med.generic_name,
          strength:        med.strength,
          dosage_form:     med.dosage_form,
          eye:             med.eye,
          dosage:          med.dosage,
          frequency:       med.frequency,
          times_per_day:   timesPerDay,
          duration:        med.duration,
          start_date:      med.start_date,
          end_date:        med.end_date,
          status:          med.status,
          instructions:    med.instructions,
          quantity_dispensed: med.quantity_dispensed,
          refills:         med.refills,
          doctor_name:     med.doctor_first_name && med.doctor_last_name
            ? `${med.doctor_first_name} ${med.doctor_last_name}` : null,
          created_at: med.created_at,
          schedule: null,
        };
      });

      // ดึง schedule + dose_times สำหรับแต่ละยา
      for (const med of result) {
        const [schedules] = await db.query(
          `SELECT ms.schedule_id, ms.frequency_type, ms.times_per_day,
            ms.sleep_mode_enabled, ms.sleep_start_time, ms.sleep_end_time,
            ms.reminder_advance_minutes, ms.is_active
          FROM MedicationSchedules ms
          WHERE ms.prescription_id = ? AND ms.patient_id = ? AND ms.is_active = 1
          ORDER BY ms.created_at DESC LIMIT 1`,
          [med.patient_medication_id, patientId]
        );

        if (schedules.length > 0) {
          const schedule = schedules[0];
          const [doseTimes] = await db.query(
            `SELECT dose_time_id, dose_time, dose_label, dose_order
             FROM MedicationDoseTimes
             WHERE schedule_id = ? AND is_active = 1
             ORDER BY dose_order ASC`,
            [schedule.schedule_id]
          );
          schedule.dose_times = doseTimes;
          schedule.sleep_mode_enabled = schedule.sleep_mode_enabled === 1;
          schedule.is_active = schedule.is_active === 1;
          med.schedule = schedule;
        }
      }

      return result;
    } catch (error) {
      console.error('[Service] Error getting patient medications:', error.message);
      throw error;
    }
  }

  // ============================================
  // getMedicationDetail — รายละเอียดยาตัวเดียว
  // ============================================
  async getMedicationDetail(patientId, prescriptionId) {
    try {
      const [medications] = await db.query(
        `SELECT
          pm.prescription_id, pm.medication_id,
          m.name AS medication_name, m.generic_name, m.strength,
          m.form AS dosage_form, m.manufacturer, m.description,
          m.side_effects, m.contraindications, m.interactions,
          pm.eye, pm.dosage, pm.frequency, pm.duration,
          pm.special_instructions, pm.status, pm.last_dispensed_date,
          pm.quantity_dispensed, pm.refills, pm.created_at,
          d.first_name AS doctor_first_name,
          d.last_name  AS doctor_last_name,
          d.license_number
        FROM PatientMedications pm
        INNER JOIN Medications m ON pm.medication_id = m.medication_id
        LEFT JOIN DoctorProfiles d ON pm.doctor_id = d.doctor_id
        WHERE pm.prescription_id = ? AND pm.patient_id = ?`,
        [prescriptionId, patientId]
      );

      if (medications.length === 0) throw new Error('ไม่พบข้อมูลยา');

      const medication = medications[0];

      const [schedules] = await db.query(
        `SELECT ms.schedule_id, ms.frequency_type, ms.times_per_day,
          ms.sleep_mode_enabled, ms.sleep_start_time, ms.sleep_end_time,
          ms.reminder_advance_minutes, ms.start_date, ms.is_active
        FROM MedicationSchedules ms
        WHERE ms.prescription_id = ? AND ms.patient_id = ? AND ms.is_active = 1
        ORDER BY ms.created_at DESC LIMIT 1`,
        [prescriptionId, patientId]
      );

      let schedule = null;
      if (schedules.length > 0) {
        schedule = schedules[0];
        const [doseTimes] = await db.query(
          `SELECT dose_time_id, dose_time, dose_label, dose_order
           FROM MedicationDoseTimes
           WHERE schedule_id = ? AND is_active = 1
           ORDER BY dose_order ASC`,
          [schedule.schedule_id]
        );
        schedule.dose_times = doseTimes;
        schedule.sleep_mode_enabled = schedule.sleep_mode_enabled === 1;
        schedule.is_active = schedule.is_active === 1;
      }

      return { ...medication, schedule };
    } catch (error) {
      console.error('[Service] Error getting medication detail:', error.message);
      throw error;
    }
  }
}

module.exports = new MedicationService();