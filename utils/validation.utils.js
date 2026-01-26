/**
 * Validation Utilities
 * รวม validation functions ตาม VALIDATION_RULES.md
 */

// ============================================
// 1. เลขบัตรประชาชน (ID Card)
// ============================================

const ID_CARD_REGEX = /^[0-9]{13}$/;

/**
 * ตรวจสอบเลขบัตรประชาชนไทย
 * - ต้องเป็นตัวเลข 13 หลัก
 * - ตรวจสอบ checksum ตามมาตรฐานไทย
 */
function validateThaiIDCard(idCard) {
  // ตรวจสอบรูปแบบ 13 หลัก
  if (!ID_CARD_REGEX.test(idCard)) {
    return { 
      valid: false, 
      message: "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก" 
    };
  }
  
  // คำนวณ checksum
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(idCard[i]) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  
  // ตรวจสอบหลักตรวจสอบ
  if (checkDigit !== parseInt(idCard[12])) {
    return { 
      valid: false, 
      message: "เลขบัตรประชาชนไม่ถูกต้อง" 
    };
  }
  
  return { valid: true };
}

// ============================================
// 2. รหัสผ่าน (Password)
// ============================================

const PASSWORD_REGEX = /^[0-9]{6}$/;

// รหัสผ่านอ่อนแอที่ห้ามใช้
const WEAK_PASSWORDS = [
  // เลขซ้ำ
  '000000', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999',
  
  // เลขง่าย
  '123456', '654321', '112233', '223344', '334455',
  '445566', '556677', '667788', '778899', '998877',
  
  // เลขต่อเนื่อง
  '012345', '123450', '234567', '345678', '456789',
  '567890', '987654', '876543', '765432', '543210'
];

/**
 * ตรวจสอบรหัสผ่าน
 * - ต้องเป็นตัวเลข 6 หลัก
 * - ห้ามเป็นรหัสผ่านอ่อนแอ
 */
function validatePassword(password) {
  // ตรวจสอบรูปแบบ
  if (!PASSWORD_REGEX.test(password)) {
    return { 
      valid: false, 
      message: "รหัสผ่านต้องเป็นตัวเลข 6 หลักเท่านั้น" 
    };
  }
  
  // ตรวจสอบรหัสผ่านอ่อนแอ
  if (WEAK_PASSWORDS.includes(password)) {
    return { 
      valid: false, 
      message: "รหัสผ่านนี้ไม่ปลอดภัย กรุณาเลือกรหัสผ่านอื่น" 
    };
  }
  
  return { valid: true };
}

// ============================================
// 3. เบอร์โทรศัพท์ (Phone Number)
// ============================================

const PHONE_REGEX = /^0[89][0-9]{8}$/;

/**
 * ตรวจสอบเบอร์โทรศัพท์ไทย
 * - ต้องขึ้นต้นด้วย 08 หรือ 09
 * - มี 10 หลัก
 */
function validatePhoneNumber(phone) {
  // ลบช่องว่างและขีด
  const cleanPhone = phone.replace(/[\s-]/g, '');
  
  if (!PHONE_REGEX.test(cleanPhone)) {
    return { 
      valid: false, 
      message: "เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 08 หรือ 09 และมี 10 หลัก" 
    };
  }
  
  return { valid: true, cleanPhone };
}

// ============================================
// 4. วันเกิด (Date of Birth)
// ============================================

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ตรวจสอบวันเกิด
 * - รูปแบบ YYYY-MM-DD
 * - ต้องเป็นวันที่ที่ถูกต้อง
 * - ไม่เป็นวันในอนาคต
 * - อายุต้องอยู่ในช่วง 0-150 ปี
 */
function validateDateOfBirth(dateString) {
  // ตรวจสอบรูปแบบ
  if (!DATE_REGEX.test(dateString)) {
    return { 
      valid: false, 
      message: "รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)" 
    };
  }
  
  const date = new Date(dateString);
  const today = new Date();
  
  // ตรวจสอบวันที่ถูกต้อง
  if (isNaN(date.getTime())) {
    return { 
      valid: false, 
      message: "วันที่ไม่ถูกต้อง" 
    };
  }
  
  // ตรวจสอบไม่ให้เป็นอนาคต
  if (date > today) {
    return { 
      valid: false, 
      message: "วันเกิดต้องไม่เป็นวันในอนาคต" 
    };
  }
  
  // คำนวณอายุ
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age--;
  }
  
  // ตรวจสอบอายุ (0-150 ปี)
  if (age < 0 || age > 150) {
    return { 
      valid: false, 
      message: "วันเกิดไม่สมเหตุสมผล" 
    };
  }
  
  return { valid: true, age };
}

// ============================================
// 5. เพศ (Gender)
// ============================================

const ALLOWED_GENDERS = ['male', 'female', 'other'];

/**
 * ตรวจสอบเพศ
 * - ต้องเป็น 'male', 'female', หรือ 'other'
 */
function validateGender(gender) {
  if (!ALLOWED_GENDERS.includes(gender)) {
    return { 
      valid: false, 
      message: "เพศต้องเป็น 'male', 'female', หรือ 'other' เท่านั้น" 
    };
  }
  return { valid: true };
}

// ============================================
// 6. ความสัมพันธ์ผู้ติดต่อฉุกเฉิน
// ============================================

/**
 * ตรวจสอบความสัมพันธ์ผู้ติดต่อฉุกเฉิน
 * - ต้องไม่เป็นค่าว่าง
 * - ไม่เกิน 50 ตัวอักษร
 */
function validateRelation(relation) {
  if (!relation || relation.trim() === '') {
    return { 
      valid: false, 
      message: "กรุณาระบุความสัมพันธ์" 
    };
  }
  
  if (relation.length > 50) {
    return {
      valid: false,
      message: "ความสัมพันธ์ต้องไม่เกิน 50 ตัวอักษร"
    };
  }
  
  return { valid: true };
}

// ============================================
// 7. ที่อยู่ (Address)
// ============================================

/**
 * ตรวจสอบที่อยู่ (Optional field)
 * - ต้องมีความยาวอย่างน้อย 10 ตัวอักษร (ถ้ามีการกรอก)
 * - ไม่เกิน 500 ตัวอักษร
 */
function validateAddress(address) {
  // Optional field - ถ้าไม่กรอกก็ผ่าน
  if (!address || address.trim() === '') {
    return { valid: true };
  }
  
  const trimmedAddress = address.trim();
  
  if (trimmedAddress.length < 10) {
    return { 
      valid: false, 
      message: "ที่อยู่ต้องมีความยาวอย่างน้อย 10 ตัวอักษร" 
    };
  }
  
  if (trimmedAddress.length > 500) {
    return { 
      valid: false, 
      message: "ที่อยู่ต้องไม่เกิน 500 ตัวอักษร" 
    };
  }
  
  return { valid: true };
}

/**
 * ตรวจสอบวันที่สำหรับนัดหมาย
 * - รูปแบบ YYYY-MM-DD
 * - ต้องเป็นวันในอนาคต (ไม่รวมวันนี้)
 * - ไม่เกิน 90 วันจากวันนี้
 */
function validateAppointmentDate(dateString) {
  // ตรวจสอบรูปแบบ
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_REGEX.test(dateString)) {
    return { 
      valid: false, 
      message: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' 
    };
  }
  
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // ตรวจสอบวันที่ถูกต้อง
  if (isNaN(date.getTime())) {
    return { 
      valid: false, 
      message: 'วันที่ไม่ถูกต้อง' 
    };
  }
  
  // ต้องเป็นวันในอนาคต (ไม่รวมวันนี้)
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date < tomorrow) {
    return { 
      valid: false, 
      message: 'วันที่นัดหมายต้องเป็นวันในอนาคต (อย่างน้อย 1 วันจากวันนี้)' 
    };
  }
  
  // ไม่เกิน 90 วันจากวันนี้
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 90);
  
  if (date > maxDate) {
    return { 
      valid: false, 
      message: 'ไม่สามารถนัดล่วงหน้าเกิน 90 วันได้' 
    };
  }
  
  return { valid: true };
}

/**
 * ตรวจสอบเวลาสำหรับนัดหมาย
 * - รูปแบบ HH:MM:SS
 * - ต้องอยู่ในช่วงเวลาทำการ (08:00:00 - 17:00:00)
 */
function validateAppointmentTime(timeString) {
  // ตรวจสอบรูปแบบ
  const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
  if (!TIME_REGEX.test(timeString)) {
    return { 
      valid: false, 
      message: 'รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM:SS)' 
    };
  }
  
  // แปลงเป็นชั่วโมง
  const [hours, minutes] = timeString.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  
  // เวลาทำการ 08:00 - 17:00
  const startTime = 8 * 60; // 08:00 = 480 minutes
  const endTime = 17 * 60;  // 17:00 = 1020 minutes
  
  if (totalMinutes < startTime || totalMinutes >= endTime) {
    return { 
      valid: false, 
      message: 'เวลานัดหมายต้องอยู่ระหว่าง 08:00 - 17:00 น.' 
    };
  }
  
  return { valid: true };
}

/**
 * ตรวจสอบเหตุผลการขอเลื่อนนัด
 * - ต้องไม่เป็นค่าว่าง
 * - ความยาว 10-500 ตัวอักษร
 */
function validateReason(reason) {
  if (!reason || reason.trim() === '') {
    return { 
      valid: false, 
      message: 'กรุณาระบุเหตุผลการขอเลื่อนนัด' 
    };
  }
  
  const trimmedReason = reason.trim();
  
  if (trimmedReason.length < 10) {
    return { 
      valid: false, 
      message: 'เหตุผลต้องมีความยาวอย่างน้อย 10 ตัวอักษร' 
    };
  }
  
  if (trimmedReason.length > 500) {
    return { 
      valid: false, 
      message: 'เหตุผลต้องไม่เกิน 500 ตัวอักษร' 
    };
  }
  
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