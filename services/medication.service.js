// services/medication.service.js
const db = require('../config/database.config');

/**
 * Service สำหรับจัดการข้อมูล Medication Compliance
 * Business Logic: คำนวณสถานะการหยอดยาแยกตามรอบเวลา (เช้า/บ่าย/เย็น)
 */
class MedicationService {
  
  /**
   * ดึงข้อมูล Medication Compliance Dashboard
   * @param {string} patientId - รหัสผู้ป่วย
   * @param {string} date - วันที่ต้องการดู (YYYY-MM-DD)
   * @returns {object} ข้อมูล compliance แยกตามรอบเวลา
   */
  async getMedicationCompliance(patientId, date) {
    try {
      console.log(`[Service] Getting medication compliance for patient: ${patientId}, date: ${date}`);
      
      // Step 1: ดึงตารางเวลาแจ้งเตือนทั้งหมดของผู้ป่วย
      const reminders = await this.getMedicationReminders(patientId, date);
      
      // Step 2: ดึงบันทึกการใช้ยาจริงของวันนั้น
      const usageRecords = await this.getMedicationUsageRecords(patientId, date);
      
      // Step 3: แยกรอบเวลา (เช้า/บ่าย/เย็น)
      const timeSlots = this.categorizeByTimeSlot(reminders, usageRecords);
      
      // Step 4: คำนวณ overall compliance
      const overallCompliance = this.calculateOverallCompliance(timeSlots);
      
      return {
        date,
        overall_compliance: overallCompliance,
        ...timeSlots
      };
      
    } catch (error) {
      console.error('[Service] Error in getMedicationCompliance:', error.message);
      throw error;
    }
  }
  
  /**
   * ดึงตารางเวลาแจ้งเตือน (MedicationReminders)
   */
  async getMedicationReminders(patientId, date) {
    try {
      // ตรวจสอบว่าวันนี้เป็นวันไหน (Mon=1, Sun=7)
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
          AND (
            mr.days_of_week IS NULL 
            OR mr.days_of_week LIKE ?
          )
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
  
  /**
   * ดึงบันทึกการใช้ยาจริง (MedicationUsageRecords)
   */
  async getMedicationUsageRecords(patientId, date) {
  try {
    const [records] = await db.query(
      `SELECT 
        ml.log_id as record_id,
        ml.schedule_id as reminder_id,
        ml.medication_id,
        ml.scheduled_datetime as scheduled_time,
        ml.actual_datetime as actual_time,
        ml.status,
        ml.notes
      FROM MedicationLogs ml
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
  
  /**
   * แยกยาตามรอบเวลา (เช้า/บ่าย/เย็น)
   * เช้า: 06:00-11:59
   * บ่าย: 12:00-17:59
   * เย็น: 18:00-05:59
   */
  categorizeByTimeSlot(reminders, usageRecords) {
  // ✅ เปลี่ยน key เป็น schedule_id เพราะ MedicationLogs ใช้ schedule_id
  const usageMap = new Map();
  usageRecords.forEach(record => {
    usageMap.set(record.reminder_id, record); // reminder_id = schedule_id
  });
  
  const slots = {
    morning: { medications: [], scheduled_count: 0, completed_count: 0 },
    afternoon: { medications: [], scheduled_count: 0, completed_count: 0 },
    evening: { medications: [], scheduled_count: 0, completed_count: 0 }
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
    
    // ✅ เปลี่ยน key เป็น reminder_id เพียวๆ
    const usage = usageMap.get(reminder.reminder_id);
    
    const medData = {
      reminder_id: reminder.reminder_id,
      medication_id: reminder.medication_id,
      medication_name: reminder.medication_name,
      generic_name: reminder.generic_name,
      scheduled_time: reminder.reminder_time,
      eye: reminder.eye,
      drops_count: reminder.drops_count,
      status: usage?.status || 'pending',
      actual_time: usage?.actual_time || null
    };
    
    slots[slot].medications.push(medData);
    slots[slot].scheduled_count++;
    
    // ✅ เปลี่ยนจาก 'taken' เป็น 'completed'
    if (usage?.status === 'completed') {
      slots[slot].completed_count++;
    }
  });
  
  Object.keys(slots).forEach(slotName => {
    const slot = slots[slotName];
    
    if (slot.scheduled_count === 0) {
      slot.status = 'no_medication';
    } else if (slot.completed_count === slot.scheduled_count) {
      slot.status = 'completed';
    } else if (slot.completed_count > 0) {
      slot.status = 'partial';
    } else {
      slot.status = 'missed';
    }
    
    slot.compliance_rate = slot.scheduled_count > 0
      ? ((slot.completed_count / slot.scheduled_count) * 100).toFixed(2)
      : 0;
  });
  
  return slots;
}
  
  /**
   * คำนวณ Overall Compliance (เฉลี่ยจากทุกรอบ)
   */
  calculateOverallCompliance(timeSlots) {
    let totalScheduled = 0;
    let totalCompleted = 0;
    
    Object.values(timeSlots).forEach(slot => {
      totalScheduled += slot.scheduled_count;
      totalCompleted += slot.completed_count;
    });
    
    if (totalScheduled === 0) return 0;
    
    const compliance = (totalCompleted / totalScheduled) * 100;
    return parseFloat(compliance.toFixed(2));
  }
  
  /**
   * ดึงข้อมูล Compliance แบบย้อนหลัง (7 วัน, 30 วัน)
   */
  async getComplianceHistory(patientId, days = 7) {
    try {
      const history = [];
      const today = new Date();
      
      // Loop ย้อนหลัง
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
      
      return history.reverse(); // เรียงจากเก่า → ใหม่
      
    } catch (error) {
      console.error('[Service] Error getting compliance history:', error.message);
      throw error;
    }
  }


/**
   * ดึงรายการยาทั้งหมดของผู้ป่วย
   * @param {string} patientId - รหัสผู้ป่วย
   * @returns {array} รายการยาที่ใช้งานอยู่
   */
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
      
      console.log(`[Service] Found ${medications.length} active medications`);
      
      // คำนวณ times_per_day จาก frequency
      const result = medications.map(med => {
        // แปลง frequency เป็น times_per_day
        let timesPerDay = 0;
        const freq = (med.frequency || '').toLowerCase();
        
        if (freq.includes('1') || freq.includes('once') || freq.includes('ครั้ง')) {
          timesPerDay = 1;
        } else if (freq.includes('2') || freq.includes('twice')) {
          timesPerDay = 2;
        } else if (freq.includes('3') || freq.includes('three')) {
          timesPerDay = 3;
        } else if (freq.includes('4') || freq.includes('four')) {
          timesPerDay = 4;
        }
        
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
            ? `${med.doctor_first_name} ${med.doctor_last_name}`
            : null,
          created_at: med.created_at
        };
      });
      
      return result;
      
    } catch (error) {
      console.error('[Service] Error getting patient medications:', error.message);
      throw error;
    }
  }

  /**
   * ดึงรายละเอียดยาตัวเดียว
   * @param {string} patientId - รหัสผู้ป่วย
   * @param {string} prescriptionId - รหัสใบสั่งยา
   * @returns {object} รายละเอียดยา
   */
  async getMedicationDetail(patientId, prescriptionId) {
  try {
    console.log(`[Service] Getting medication detail: ${prescriptionId}`);
    
    const [medications] = await db.query(
      `SELECT 
        pm.prescription_id,
        pm.medication_id,
        m.name as medication_name,
        m.generic_name,
        m.strength,
        m.form as dosage_form,
        m.manufacturer,
        m.description,
        m.side_effects,
        m.contraindications,
        m.interactions,
        pm.eye,
        pm.dosage,
        pm.frequency,
        pm.duration,
        pm.special_instructions,
        pm.status,
        pm.last_dispensed_date,
        pm.quantity_dispensed,
        pm.refills,
        pm.created_at,
        d.first_name as doctor_first_name,
        d.last_name as doctor_last_name,
        d.license_number
      FROM PatientMedications pm
      INNER JOIN Medications m ON pm.medication_id = m.medication_id
      LEFT JOIN DoctorProfiles d ON pm.doctor_id = d.doctor_id
      WHERE pm.prescription_id = ?
        AND pm.patient_id = ?`,
      [prescriptionId, patientId]
    );
    
    if (medications.length === 0) {
      throw new Error('ไม่พบข้อมูลยา');
    }

    const medication = medications[0];

    // ✅ เพิ่ม: ดึง schedule + dose_times
    const [schedules] = await db.query(
      `SELECT
        ms.schedule_id,
        ms.frequency_type,
        ms.times_per_day,
        ms.sleep_mode_enabled,
        ms.sleep_start_time,
        ms.sleep_end_time,
        ms.reminder_advance_minutes,
        ms.start_date,
        ms.is_active
      FROM MedicationSchedules ms
      WHERE ms.prescription_id = ?
        AND ms.patient_id = ?
        AND ms.is_active = 1
      ORDER BY ms.created_at DESC
      LIMIT 1`,
      [prescriptionId, patientId]
    );

    let schedule = null;

    if (schedules.length > 0) {
      schedule = schedules[0];

      const [doseTimes] = await db.query(
        `SELECT
          dose_time_id,
          dose_time,
          dose_label,
          dose_order
        FROM MedicationDoseTimes
        WHERE schedule_id = ?
        ORDER BY dose_order ASC`,
        [schedule.schedule_id]
      );

      schedule.dose_times = doseTimes;
      schedule.sleep_mode_enabled = schedule.sleep_mode_enabled === 1;
      schedule.is_active = schedule.is_active === 1;
    }

    return {
      ...medication,
      schedule, // null ถ้ายังไม่ได้ตั้งค่า
    };
    
  } catch (error) {
    console.error('[Service] Error getting medication detail:', error.message);
    throw error;
  }
}
}
module.exports = new MedicationService();
