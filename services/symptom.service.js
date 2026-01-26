const db = require('../config/database.config');

/**
 * สร้าง Symptom Log ID แบบ unique
 * Format: SYM + timestamp(ms) + random(3)
 */
function generateSymptomLogId() {
  const timestamp = Date.now().toString().slice(-10);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `SYM${timestamp}${random}`;
}

/**
 * แปลงค่า severity จาก 1-10 เป็น enum (mild, moderate, severe)
 */
function mapSeverityToEnum(severityNumber) {
  if (severityNumber >= 1 && severityNumber <= 3) {
    return 'mild';
  } else if (severityNumber >= 4 && severityNumber <= 6) {
    return 'moderate';
  } else {
    return 'severe';
  }
}

/**
 * บันทึกอาการผิดปกติ
 */
async function createSymptomLog(symptomData) {
  try {
    const symptomLogId = generateSymptomLogId();
    
    // ถ้าไม่ระบุเวลา ใช้เวลาปัจจุบัน
    const symptomTime = symptomData.symptom_time || 
                       new Date().toTimeString().split(' ')[0];
    
    // แปลง severity จากตัวเลขเป็น enum
    const severityEnum = mapSeverityToEnum(symptomData.severity);
    
    // ✅ ลบ affected_eye ออก และใช้ columns ที่มีจริง
    await db.query(
      `INSERT INTO SymptomRecords (
        symptom_id,
        patient_id,
        symptom_date,
        symptom_time,
        symptom_type,
        severity,
        description,
        related_activity,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        symptomLogId,
        symptomData.patient_id,
        symptomData.symptom_date,
        symptomTime,
        symptomData.symptom_type,
        severityEnum,  // ✅ ใช้ enum แทนตัวเลข
        symptomData.description,
        symptomData.related_activity || null
      ]
    );
    
    return { symptomLogId };
    
  } catch (error) {
    console.error('Error in createSymptomLog service:', error);
    throw new Error('ไม่สามารถบันทึกอาการได้');
  }
}

/**
 * ดึงประวัติอาการของผู้ป่วย
 */
async function getSymptomLogsByPatient(patientId, filters = {}) {
  try {
    let query = `
      SELECT 
        symptom_id,
        symptom_date,
        symptom_time,
        symptom_type,
        severity,
        description,
        related_activity,
        created_at
      FROM SymptomRecords
      WHERE patient_id = ?
    `;
    
    const params = [patientId];
    
    // กรองตามวันที่
    if (filters.startDate) {
      query += ' AND symptom_date >= ?';
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ' AND symptom_date <= ?';
      params.push(filters.endDate);
    }
    
    // กรองตามประเภทอาการ
    if (filters.symptomType) {
      query += ' AND symptom_type = ?';
      params.push(filters.symptomType);
    }
    
    // กรองตามความรุนแรง
    if (filters.severity) {
      query += ' AND severity = ?';
      params.push(filters.severity);
    }
    
    query += ' ORDER BY symptom_date DESC, symptom_time DESC';
    
    // จำกัดจำนวนผลลัพธ์
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }
    
    const [logs] = await db.query(query, params);
    
    return logs;
    
  } catch (error) {
    console.error('Error in getSymptomLogsByPatient service:', error);
    throw new Error('ไม่สามารถดึงข้อมูลอาการได้');
  }
}

/**
 * ดึงข้อมูลอาการ 1 รายการ
 */
async function getSymptomLogById(symptomId, patientId) {
  try {
    const [logs] = await db.query(
      `SELECT 
        symptom_id,
        symptom_date,
        symptom_time,
        symptom_type,
        severity,
        description,
        related_activity,
        created_at
      FROM SymptomRecords
      WHERE symptom_id = ? AND patient_id = ?`,
      [symptomId, patientId]
    );
    
    return logs[0] || null;
    
  } catch (error) {
    console.error('Error in getSymptomLogById service:', error);
    throw new Error('ไม่สามารถดึงข้อมูลอาการได้');
  }
}

module.exports = {
  createSymptomLog,
  getSymptomLogsByPatient,
  getSymptomLogById
};