/**
 * ID Generator สำหรับระบบ EyeMate
 * สร้าง unique ID ตาม pattern ของระบบ
 */

/**
 * Generate unique ID with prefix (max 20 characters)
 * @param {string} prefix - Prefix for ID (e.g., 'PAT', 'DOC', 'TOKEN', 'SCHED', 'LOG')
 * @returns {string} Generated ID (max 20 chars for varchar(20))
 * 
 * Format: PREFIX + last 10 digits of timestamp + 5-char random
 * Examples:
 *  - generateId('PAT')    => PAT8065234567AB12C
 *  - generateId('TOKEN')  => TOKEN5234567XYZ78
 *  - generateId('SCHED')  => SCHED4567DEF456
 * 
 * Length calculation:
 *  - Short prefix (3 chars): 3 + 10 + 5 = 18 chars ✅
 *  - Long prefix (5 chars):  5 + 10 + 5 = 20 chars ✅
 */
const generateId = (prefix = 'ID') => {
  const timestamp = Date.now().toString().slice(-10); // ใช้แค่ 10 หลักท้าย
  const random = Math.random().toString(36).substring(2, 7).toUpperCase(); // ใช้แค่ 5 ตัว
  return `${prefix}${timestamp}${random}`;
};

/**
 * Generate Patient ID
 * @returns {string} Patient ID (PAT + timestamp + random)
 */
const generatePatientId = () => {
  return generateId('PAT');
};

/**
 * Generate Doctor ID
 * @returns {string} Doctor ID (DOC + timestamp + random)
 */
const generateDoctorId = () => {
  return generateId('DOC');
};

/**
 * Generate Admin ID
 * @returns {string} Admin ID (ADM + timestamp + random)
 */
const generateAdminId = () => {
  return generateId('ADM');
};

/**
 * Generate Medication Schedule ID
 * @returns {string} Schedule ID (SCHED + timestamp + random)
 */
const generateScheduleId = () => {
  return generateId('SCHED');
};

/**
 * Generate Medication Log ID
 * @returns {string} Log ID (LOG + timestamp + random)
 */
const generateLogId = () => {
  return generateId('LOG');
};

/**
 * Generate Push Token ID
 * @returns {string} Token ID (TOKEN + timestamp + random)
 */
const generateTokenId = () => {
  return generateId('TOKEN');
};

/**
 * Generate Notification ID
 * @returns {string} Notification ID (NOTIF + timestamp + random)
 */
const generateNotificationId = () => {
  return generateId('NOTIF');
};

/**
 * Generate IOP Reading ID
 * @returns {string} IOP ID (IOP + timestamp + random)
 */
const generateIOPId = () => {
  return generateId('IOP');
};

/**
 * Generate Appointment ID
 * @returns {string} Appointment ID (APPT + timestamp + random)
 */
const generateAppointmentId = () => {
  return generateId('APPT');
};

/**
 * Generate Prescription ID
 * @returns {string} Prescription ID (PRES + timestamp + random)
 */
const generatePrescriptionId = () => {
  return generateId('PRES');
};

module.exports = {
  generateId,
  generatePatientId,
  generateDoctorId,
  generateAdminId,
  generateScheduleId,
  generateLogId,
  generateTokenId,
  generateNotificationId,
  generateIOPId,
  generateAppointmentId,
  generatePrescriptionId
};