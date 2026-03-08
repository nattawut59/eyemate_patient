/**
 * Validation Utilities
 * รวม validation functions ตาม VALIDATION_RULES.md
 */

const ID_CARD_REGEX = /^[0-9]{13}$/;

function validateThaiIDCard(idCard) {
  if (!ID_CARD_REGEX.test(idCard)) {
    return { valid: false, message: "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก" };
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(idCard[i]) * (13 - i);
  const checkDigit = (11 - (sum % 11)) % 10;
  if (checkDigit !== parseInt(idCard[12])) {
    return { valid: false, message: "เลขบัตรประชาชนไม่ถูกต้อง" };
  }
  return { valid: true };
}

const PASSWORD_REGEX = /^[0-9]{6}$/;
const WEAK_PASSWORDS = [
  '000000','111111','222222','333333','444444','555555','666666','777777','888888','999999',
  '123456','654321','112233','223344','334455','445566','556677','667788','778899','998877',
  '012345','123450','234567','345678','456789','567890','987654','876543','765432','543210'
];

function validatePassword(password) {
  if (!PASSWORD_REGEX.test(password)) {
    return { valid: false, message: "รหัสผ่านต้องเป็นตัวเลข 6 หลักเท่านั้น" };
  }
  if (WEAK_PASSWORDS.includes(password)) {
    return { valid: false, message: "รหัสผ่านนี้ไม่ปลอดภัย กรุณาเลือกรหัสผ่านอื่น" };
  }
  return { valid: true };
}

const PHONE_REGEX = /^0[6-9][0-9]{8}$/;

function validatePhoneNumber(phone) {
  const cleanPhone = phone.replace(/[\s-]/g, '');
  if (!PHONE_REGEX.test(cleanPhone)) {
    return { valid: false, message: "เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 08 หรือ 09 และมี 10 หลัก" };
  }
  return { valid: true, cleanPhone };
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateDateOfBirth(dateString) {
  if (!DATE_REGEX.test(dateString)) {
    return { valid: false, message: "รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)" };
  }
  const date = new Date(dateString);
  const today = new Date();
  if (isNaN(date.getTime())) return { valid: false, message: "วันที่ไม่ถูกต้อง" };
  if (date > today) return { valid: false, message: "วันเกิดต้องไม่เป็นวันในอนาคต" };
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age--;
  if (age < 0 || age > 150) return { valid: false, message: "วันเกิดไม่สมเหตุสมผล" };
  return { valid: true, age };
}

const ALLOWED_GENDERS = ['male', 'female', 'other'];
function validateGender(gender) {
  if (!ALLOWED_GENDERS.includes(gender)) {
    return { valid: false, message: "เพศต้องเป็น 'male', 'female', หรือ 'other' เท่านั้น" };
  }
  return { valid: true };
}

function validateRelation(relation) {
  if (!relation || relation.trim() === '') return { valid: false, message: "กรุณาระบุความสัมพันธ์" };
  if (relation.length > 50) return { valid: false, message: "ความสัมพันธ์ต้องไม่เกิน 50 ตัวอักษร" };
  return { valid: true };
}

function validateAddress(address) {
  if (!address || address.trim() === '') return { valid: true };
  const trimmedAddress = address.trim();
  if (trimmedAddress.length < 10) return { valid: false, message: "ที่อยู่ต้องมีความยาวอย่างน้อย 10 ตัวอักษร" };
  if (trimmedAddress.length > 500) return { valid: false, message: "ที่อยู่ต้องไม่เกิน 500 ตัวอักษร" };
  return { valid: true };
}

function validateAppointmentDate(dateString) {
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_REGEX.test(dateString)) {
    return { valid: false, message: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' };
  }
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(date.getTime())) return { valid: false, message: 'วันที่ไม่ถูกต้อง' };
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date < tomorrow) return { valid: false, message: 'วันที่นัดหมายต้องเป็นวันในอนาคต (อย่างน้อย 1 วันจากวันนี้)' };
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 90);
  if (date > maxDate) return { valid: false, message: 'ไม่สามารถนัดล่วงหน้าเกิน 90 วันได้' };
  return { valid: true };
}

/**
 * ✅ ตรวจสอบเวลาตามตารางคลินิกจริง
 * - อังคาร (dow=2): 08:30 – 20:00 น.
 * - พุธ    (dow=3): 13:00 – 16:00 น.
 * @param {string} timeString - HH:MM:SS
 * @param {string} dateString - YYYY-MM-DD (optional)
 */
function validateAppointmentTime(timeString, dateString = null) {
  const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
  if (!TIME_REGEX.test(timeString)) {
    return { valid: false, message: 'รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM:SS)' };
  }

  // ถ้าไม่มีวันที่ ผ่าน format อย่างเดียว
  if (!dateString) return { valid: true };

  const CLINIC_HOURS = {
    2: { startH: 8,  startM: 30, endH: 20, endM: 0,  label: '08:30 – 20:00 น.' },
    3: { startH: 13, startM: 0,  endH: 16, endM: 0,  label: '13:00 – 16:00 น.' },
  };

  const dow = new Date(`${dateString}T00:00:00`).getDay();
  const clinic = CLINIC_HOURS[dow];

  if (!clinic) {
    return { valid: false, message: 'วันที่เลือกไม่มีคลินิก (รับเฉพาะวันอังคารและพุธ)' };
  }

  const [h, m] = timeString.split(':').map(Number);
  const totalMins = h * 60 + m;
  const startMins = clinic.startH * 60 + clinic.startM;
  const endMins   = clinic.endH   * 60 + clinic.endM;

  if (totalMins < startMins || totalMins >= endMins) {
    return { valid: false, message: `เวลานัดหมายต้องอยู่ระหว่าง ${clinic.label}` };
  }

  return { valid: true };
}

function validateReason(reason) {
  if (!reason || reason.trim() === '') return { valid: false, message: 'กรุณาระบุเหตุผลการขอเลื่อนนัด' };
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10) return { valid: false, message: 'เหตุผลต้องมีความยาวอย่างน้อย 10 ตัวอักษร' };
  if (trimmedReason.length > 500) return { valid: false, message: 'เหตุผลต้องไม่เกิน 500 ตัวอักษร' };
  return { valid: true };
}

module.exports = {
  validateThaiIDCard,
  validatePassword,
  validatePhoneNumber,
  validateDateOfBirth,
  validateGender,
  validateRelation,
  validateAddress,
  validateAppointmentDate,
  validateAppointmentTime,
  validateReason
};

