/**
 * Validation Middleware
 * ตรวจสอบข้อมูลก่อนส่งเข้า controller
 */

const {validateThaiIDCard,validatePassword,validatePhoneNumber,validateDateOfBirth,validateGender,validateRelation,validateAddress} = require('../utils/validation.utils');
const { body, query, validationResult } = require('express-validator');
/**
 * Validation Middleware สำหรับ Registration
 * ตรวจสอบข้อมูลทั้งหมดก่อนสร้าง account
 */
const validateRegistration = [
  // 1. เลขบัตรประชาชน
  body('id_card')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกเลขบัตรประชาชน')
    .matches(/^[0-9]{13}$/)
    .withMessage('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก')
    .custom((value) => {
      const result = validateThaiIDCard(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 2. รหัสผ่าน
  body('password')
    .notEmpty()
    .withMessage('กรุณากรอกรหัสผ่าน')
    .matches(/^[0-9]{6}$/)
    .withMessage('รหัสผ่านต้องเป็นตัวเลข 6 หลัก')
    .custom((value) => {
      const result = validatePassword(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 3. เบอร์โทรศัพท์
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกเบอร์โทรศัพท์')
    .custom((value) => {
      const result = validatePhoneNumber(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 4. ชื่อ
  body('first_name')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกชื่อ')
    .isLength({ min: 2, max: 100 })
    .withMessage('ชื่อต้องมี 2-100 ตัวอักษร'),
  
  // 5. นามสกุล
  body('last_name')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกนามสกุล')
    .isLength({ min: 2, max: 100 })
    .withMessage('นามสกุลต้องมี 2-100 ตัวอักษร'),
  
  // 6. วันเกิด
  body('date_of_birth')
    .notEmpty()
    .withMessage('กรุณากรอกวันเกิด')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)')
    .custom((value) => {
      const result = validateDateOfBirth(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 7. เพศ
  body('gender')
    .notEmpty()
    .withMessage('กรุณาเลือกเพศ')
    .custom((value) => {
      const result = validateGender(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 8. ผู้ติดต่อฉุกเฉิน - ชื่อ
  body('emergency_contact_first_name')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกชื่อผู้ติดต่อฉุกเฉิน')
    .isLength({ min: 2, max: 100 })
    .withMessage('ชื่อผู้ติดต่อฉุกเฉินต้องมี 2-100 ตัวอักษร'),
  
  // 9. ผู้ติดต่อฉุกเฉิน - นามสกุล
  body('emergency_contact_last_name')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกนามสกุลผู้ติดต่อฉุกเฉิน')
    .isLength({ min: 2, max: 100 })
    .withMessage('นามสกุลผู้ติดต่อฉุกเฉินต้องมี 2-100 ตัวอักษร'),
  
  // 10. ผู้ติดต่อฉุกเฉิน - เบอร์โทร
  body('emergency_contact_phone')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกเบอร์ผู้ติดต่อฉุกเฉิน')
    .custom((value) => {
      const result = validatePhoneNumber(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 11. ผู้ติดต่อฉุกเฉิน - ความสัมพันธ์
  body('emergency_contact_relation')
    .trim()
    .notEmpty()
    .withMessage('กรุณาระบุความสัมพันธ์กับผู้ติดต่อฉุกเฉิน')
    .custom((value) => {
      const result = validateRelation(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 12. ยินยอมการใช้ข้อมูล (PDPA)
  body('consent_to_data_usage')
    .notEmpty()
    .withMessage('กรุณายินยอมการใช้ข้อมูล')
    .isBoolean()
    .withMessage('ค่ายินยอมต้องเป็น true หรือ false')
    .custom((value) => {
      if (value !== true) {
        throw new Error('ต้องยินยอมการใช้ข้อมูลก่อนสมัครใช้งาน');
      }
      return true;
    }),
  
  // 13. ที่อยู่ (optional)
  body('address')
    .optional()
    .trim()
    .custom((value) => {
      if (value) {
        const result = validateAddress(value);
        if (!result.valid) {
          throw new Error(result.message);
        }
      }
      return true;
    }),
  
  // Middleware สำหรับจัดการ validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }));
      
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ถูกต้อง',
        details: errorDetails
      });
    }
    
    next();
  }
];

/**
 * Validation Middleware สำหรับ Login
 * ตรวจสอบ id_card และ password
 */
const validateLogin = [
  // 1. เลขบัตรประชาชน
  body('id_card')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกเลขบัตรประชาชน')
    .matches(/^[0-9]{13}$/)
    .withMessage('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'),
  
  // 2. รหัสผ่าน
  body('password')
    .notEmpty()
    .withMessage('กรุณากรอกรหัสผ่าน')
    .matches(/^[0-9]{6}$/)
    .withMessage('รหัสผ่านต้องเป็นตัวเลข 6 หลัก'),
  
  // Middleware สำหรับจัดการ validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }));
      
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ถูกต้อง',
        details: errorDetails
      });
    }
    
    next();
  }
];

/**
 * Validation Middleware สำหรับ Reset Password
 * ตรวจสอบ id_card, emergency_phone, และ new_password
 */
const validateResetPassword = [
  // 1. เลขบัตรประชาชน
  body('id_card')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกเลขบัตรประชาชน')
    .matches(/^[0-9]{13}$/)
    .withMessage('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'),
  
  // 2. เบอร์ผู้ติดต่อฉุกเฉิน (สำหรับยืนยันตัวตน)
  body('emergency_phone')
    .trim()
    .notEmpty()
    .withMessage('กรุณากรอกเบอร์ผู้ติดต่อฉุกเฉิน')
    .custom((value) => {
      const result = validatePhoneNumber(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 3. รหัสผ่านใหม่
  body('new_password')
    .notEmpty()
    .withMessage('กรุณากรอกรหัสผ่านใหม่')
    .matches(/^[0-9]{6}$/)
    .withMessage('รหัสผ่านต้องเป็นตัวเลข 6 หลัก')
    .custom((value) => {
      const result = validatePassword(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // Middleware สำหรับจัดการ validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }));
      
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ถูกต้อง',
        details: errorDetails
      });
    }
    
    next();
  }
];

/**
 * Validation middleware สำหรับ query parameters ของ appointments
 */
const validateAppointmentQuery = [
  query('status')
    .optional()
    .isIn(['upcoming', 'past', 'all'])
    .withMessage('status ต้องเป็น upcoming, past, หรือ all เท่านั้น'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ถูกต้อง',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    next();
  }
];

const { 
  validateAppointmentDate, 
  validateAppointmentTime, 
  validateReason 
} = require('../utils/validation.utils');

/**
 * Validation Middleware สำหรับขอเลื่อนนัดหมาย
 */
const validateAppointmentRequest = [
  // 1. appointment_id
  body('appointment_id')
    .trim()
    .notEmpty()
    .withMessage('กรุณาระบุรหัสนัดหมาย')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('รหัสนัดหมายไม่ถูกต้อง'),
  
  // 2. requested_date
  body('requested_date')
    .trim()
    .notEmpty()
    .withMessage('กรุณาระบุวันที่ต้องการนัด')
    .custom((value) => {
      const result = validateAppointmentDate(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 3. requested_time
  body('requested_time')
    .trim()
    .notEmpty()
    .withMessage('กรุณาระบุเวลาที่ต้องการนัด')
    .custom((value) => {
      const result = validateAppointmentTime(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // 4. reason
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('กรุณาระบุเหตุผลการขอเลื่อนนัด')
    .custom((value) => {
      const result = validateReason(value);
      if (!result.valid) {
        throw new Error(result.message);
      }
      return true;
    }),
  
  // Middleware สำหรับจัดการ validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }));
      
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ถูกต้อง',
        details: errorDetails
      });
    }
    
    next();
  }
];

/**
 * Validation Middleware สำหรับบันทึกอาการผิดปกติ
 */
const validateSymptomLog = [
  // วันที่เกิดอาการ (บังคับ)
  body('symptom_date')
    .notEmpty()
    .withMessage('กรุณาระบุวันที่เกิดอาการ')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)')
    .custom((value) => {
      const date = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      if (isNaN(date.getTime())) {
        throw new Error('วันที่ไม่ถูกต้อง');
      }
      
      if (date > today) {
        throw new Error('วันที่เกิดอาการต้องไม่เป็นวันในอนาคต');
      }
      
      return true;
    }),
  
  // เวลาเกิดอาการ (ไม่บังคับ)
  body('symptom_time')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM:SS)'),
  
  // ประเภทอาการ (บังคับ)
  body('symptom_type')
    .trim()
    .notEmpty()
    .withMessage('กรุณาระบุประเภทอาการ')
    .isLength({ max: 50 })
    .withMessage('ประเภทอาการต้องไม่เกิน 50 ตัวอักษร'),
  
  // ความรุนแรง (1-10, บังคับ)
  body('severity')
    .notEmpty()
    .withMessage('กรุณาระบุความรุนแรงของอาการ')
    .isInt({ min: 1, max: 10 })
    .withMessage('ความรุนแรงต้องเป็นตัวเลข 1-10')
    .toInt(),
  
  // รายละเอียดอาการ (บังคับ)
  body('description')
    .trim()
    .notEmpty()
    .withMessage('กรุณาระบุรายละเอียดอาการ')
    .isLength({ min: 10, max: 1000 })
    .withMessage('รายละเอียดต้องมี 10-1000 ตัวอักษร'),
  
  // ✅ ลบ affected_eye validation ออก
  
  // กิจกรรมที่เกี่ยวข้อง (ไม่บังคับ)
  body('related_activity')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('กิจกรรมที่เกี่ยวข้องต้องไม่เกิน 100 ตัวอักษร'),
  
  // Middleware จัดการ validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ถูกต้อง',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    next();
  }
];


/**
 * Validation สำหรับการสร้าง Schedule
 */
const validateScheduleCreation = [
  body('prescription_id')
    .notEmpty()
    .withMessage('กรุณาระบุ prescription_id'),

  body('medication_id')
    .notEmpty()
    .withMessage('กรุณาระบุ medication_id'),

  body('frequency_type')
    .isIn(['fixed_times', 'interval', 'custom'])
    .withMessage('frequency_type ต้องเป็น fixed_times, interval, หรือ custom'),

  body('interval_hours')
    .optional()
    .isInt({ min: 1, max: 24 })
    .withMessage('interval_hours ต้องเป็นตัวเลข 1-24'),

  body('times_per_day')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('times_per_day ต้องเป็นตัวเลข 1-10'),

  body('dose_times')
    .optional()
    .isArray()
    .withMessage('dose_times ต้องเป็น array'),

  body('dose_times.*.dose_time')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('dose_time ต้องเป็นรูปแบบ HH:MM:SS'),

  body('dose_spacing_minutes')
    .optional()
    .isInt({ min: 0, max: 60 })
    .withMessage('dose_spacing_minutes ต้องเป็น 0-60 นาที'),

  body('start_date')
    .notEmpty()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('start_date ต้องเป็นรูปแบบ YYYY-MM-DD'),

  body('end_date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('end_date ต้องเป็นรูปแบบ YYYY-MM-DD'),

  body('sleep_mode_enabled')
    .optional()
    .isBoolean()
    .withMessage('sleep_mode_enabled ต้องเป็น true/false'),

  body('sleep_start_time')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('sleep_start_time ต้องเป็นรูปแบบ HH:MM:SS'),

  body('sleep_end_time')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('sleep_end_time ต้องเป็นรูปแบบ HH:MM:SS'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ถูกต้อง',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    next();
  }
];

/**
 * Validation สำหรับการอัปเดต Schedule
 */
const validateScheduleUpdate = [
  body('times_per_day')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('times_per_day ต้องเป็นตัวเลข 1-10'),

  body('dose_spacing_minutes')
    .optional()
    .isInt({ min: 0, max: 60 })
    .withMessage('dose_spacing_minutes ต้องเป็น 0-60 นาที'),

  body('sleep_mode_enabled')
    .optional()
    .isBoolean()
    .withMessage('sleep_mode_enabled ต้องเป็น true/false'),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active ต้องเป็น true/false'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ถูกต้อง',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        }))
      });
    }
    next();
  }
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateResetPassword,
  validateAppointmentQuery,
  validateAppointmentRequest,
  validateSymptomLog,
  validateScheduleCreation,
  validateScheduleUpdate
};