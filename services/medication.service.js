// services/medication.service.js
const db = require('../config/database.config');

class MedicationService {
  
  async getMedicationCompliance(patientId, date) {
    try {
      console.log(`[Service] Getting medication compliance for patient: ${patientId}, date: ${date}`);
      const reminders = await this.getMedicationReminders(patientId, date);
      const usageRecords = await this.getMedicationUsageRecords(patientId, date);
      const timeSlots = this.categorizeByTimeSlot(reminders, usageRecords);
      const overallCompliance = this.calculateOverallCompliance(timeSlots);
      return { date, overall_compliance: overallCompliance, ...timeSlots };
    } catch (error) {
      console.error('[Service] Error in getMedicationCompliance:', error.message);
      throw error;
    }
  }
  
  async getMedicationReminders(patientId, date) {
    try {
      const dayOfWeek = new Date(date).getDay();
      const dayMapping = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const currentDay = dayMapping[dayOfWeek];
      
      const [reminders] = await db.query(
        `SELECT 
          mr.reminder_id,
          mr.medication_id,
          mr.reminder_time,
          mr.eye,
          mr.drops_count,
          mr.days_of_week,
          m.name as medication_name,
          m.generic_name,
          pm.prescription_id
        FROM MedicationReminders mr
        INNER JOIN Medications m ON mr.medication_id = m.medication_id
        INNER JOIN PatientMedications pm ON mr.prescription_id = pm.prescription_id
        WHERE mr.patient_id = ?
          AND mr.is_active = 1
          AND pm.status = 'active'
          AND (mr.days_of_week IS NULL OR mr.days_of_week LIKE ?)
          AND (mr.end_date IS NULL OR mr.end_date >= ?)
        ORDER BY mr.reminder_time ASC`,
        [patientId, `%${currentDay}%`, date]
      );
      
      console.log(`[Service] Found ${reminders.length} reminders for ${date}`);
      return reminders;
    } catch (error) {
      console.error('[Service] Error getting reminders:', error.message);
      throw error;
    }
  }
  
  async getMedicationUsageRecords(patientId, date) {
    try {
      const [records] = await db.query(
        `SELECT 
          ml.log_id,
          ml.log_id as record_id,
          ml.medication_id,
          ml.scheduled_datetime as scheduled_time,
          ml.actual_datetime as actual_time,
          ml.status,
          ml.notes,
          mr.reminder_id,
          mr.reminder_time
        FROM MedicationLogs ml
        JOIN MedicationSchedules ms ON ml.schedule_id = ms.schedule_id
        JOIN MedicationReminders mr ON ms.prescription_id = mr.prescription_id
          AND mr.patient_id = ml.patient_id
          AND TIME(ml.scheduled_datetime) = mr.reminder_time
        WHERE ml.patient_id = ?
          AND DATE(CONVERT_TZ(ml.scheduled_datetime, '+00:00', '+07:00')) = ?
        ORDER BY ml.scheduled_datetime ASC`,
        [patientId, date]
      );
      
      console.log(`[Service] Found ${records.length} usage records for ${date}`);
      return records;
    } catch (error) {
      console.error('[Service] Error getting usage records:', error.message);
      throw error;
    }
  }
  
  categorizeByTimeSlot(reminders, usageRecords) {
    // ✅ map ด้วย reminder_time → เก็บ log_id ด้วย
    const usageMap = new Map();
    usageRecords.forEach(record => {
      const time = new Date(record.scheduled_time)
        .toLocaleTimeString('th-TH', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false, timeZone: 'Asia/Bangkok'
        });
      usageMap.set(time, record);
      // ✅ map ด้วย reminder_time ด้วย (fallback)
      if (record.reminder_time) {
        usageMap.set(record.reminder_time, record);
      }
    });
    
    const slots = {
      morning:   { medications: [], scheduled_count: 0, completed_count: 0 },
      afternoon: { medications: [], scheduled_count: 0, completed_count: 0 },
      evening:   { medications: [], scheduled_count: 0, completed_count: 0 }
    };
    
    reminders.forEach(reminder => {
      const hour = parseInt(reminder.reminder_time.split(':')[0]);
      let slot;
      if (hour >= 6 && hour < 12)       slot = 'morning';
      else if (hour >= 12 && hour < 18) slot = 'afternoon';
      else                               slot = 'evening';
      
      const usage = usageMap.get(reminder.reminder_time);
      
      slots[slot].medications.push({
        // ✅ ส่ง log_id กลับไปด้วย — frontend ใช้กดหยอดยา
        reminder_id: usage?.log_id || reminder.reminder_id,
        log_id: usage?.log_id || null,
        medication_id: reminder.medication_id,
        medication_name: reminder.medication_name,
        generic_name: reminder.generic_name,
        scheduled_time: reminder.reminder_time,
        eye: reminder.eye,
        drops_count: reminder.drops_count,
        status: usage?.status || 'pending',
        actual_time: usage?.actual_time || null
      });
      slots[slot].scheduled_count++;
      if (usage?.status === 'completed') slots[slot].completed_count++;
    });
    
    Object.keys(slots).forEach(slotName => {
      const slot = slots[slotName];
      if (slot.scheduled_count === 0)                         slot.status = 'no_medication';
      else if (slot.completed_count === slot.scheduled_count) slot.status = 'completed';
      else if (slot.completed_count > 0)                      slot.status = 'partial';
      else                                                     slot.status = 'missed';
      slot.compliance_rate = slot.scheduled_count > 0
        ? ((slot.completed_count / slot.scheduled_count) * 100).toFixed(2) : 0;
    });
    
    return slots;
  }
  
  calculateOverallCompliance(timeSlots) {
    let totalScheduled = 0, totalCompleted = 0;
    Object.values(timeSlots).forEach(slot => {
      totalScheduled += slot.scheduled_count;
      totalCompleted += slot.completed_count;
    });
    if (totalScheduled === 0) return 0;
    return parseFloat(((totalCompleted / totalScheduled) * 100).toFixed(2));
  }
  
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
          morning_status: compliance.morning.status,
          afternoon_status: compliance.afternoon.status,
          evening_status: compliance.evening.status
        });
      }
      return history.reverse();
    } catch (error) {
      console.error('[Service] Error getting compliance history:', error.message);
      throw error;
    }
  }

  async getPatientMedications(patientId) {
    try {
      console.log(`[Service] Getting medications for patient: ${patientId}`);
      
      const [medications] = await db.query(
        `SELECT 
          pm.prescription_id as patient_medication_id,
          pm.medication_id,
          m.name as medication_name,
          m.generic_name,
          m.strength,
          m.form as dosage_form,
          pm.eye,
          pm.dosage,
          pm.frequency,
          pm.duration,
          pm.special_instructions as instructions,
          pm.status,
          pm.last_dispensed_date as start_date,
          DATE_ADD(pm.last_dispensed_date, INTERVAL 
            CAST(SUBSTRING_INDEX(pm.duration, ' ', 1) AS UNSIGNED) DAY
          ) as end_date,
          pm.quantity_dispensed,
          pm.refills,
          pm.created_at,
          d.first_name as doctor_first_name,
          d.last_name as doctor_last_name
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
        if (freq.includes('1') || freq.includes('once') || freq.includes('ครั้ง')) timesPerDay = 1;
        else if (freq.includes('2') || freq.includes('twice')) timesPerDay = 2;
        else if (freq.includes('3') || freq.includes('three')) timesPerDay = 3;
        else if (freq.includes('4') || freq.includes('four')) timesPerDay = 4;
        
        return {
          patient_medication_id: med.patient_medication_id,
          medication_id: med.medication_id,
          medication_name: med.medication_name,
          generic_name: med.generic_name,
          strength: med.strength,
          dosage_form: med.dosage_form,
          eye: med.eye,
          dosage: med.dosage,
          frequency: med.frequency,
          times_per_day: timesPerDay,
          duration: med.duration,
          start_date: med.start_date,
          end_date: med.end_date,
          status: med.status,
          instructions: med.instructions,
          quantity_dispensed: med.quantity_dispensed,
          refills: med.refills,
          doctor_name: med.doctor_first_name && med.doctor_last_name
            ? `${med.doctor_first_name} ${med.doctor_last_name}` : null,
          created_at: med.created_at,
          schedule: null
        };
      });

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
             FROM MedicationDoseTimes WHERE schedule_id = ? ORDER BY dose_order ASC`,
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

  async getMedicationDetail(patientId, prescriptionId) {
    try {
      const [medications] = await db.query(
        `SELECT 
          pm.prescription_id, pm.medication_id,
          m.name as medication_name, m.generic_name, m.strength,
          m.form as dosage_form, m.manufacturer, m.description,
          m.side_effects, m.contraindications, m.interactions,
          pm.eye, pm.dosage, pm.frequency, pm.duration,
          pm.special_instructions, pm.status, pm.last_dispensed_date,
          pm.quantity_dispensed, pm.refills, pm.created_at,
          d.first_name as doctor_first_name, d.last_name as doctor_last_name, d.license_number
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
           FROM MedicationDoseTimes WHERE schedule_id = ? ORDER BY dose_order ASC`,
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