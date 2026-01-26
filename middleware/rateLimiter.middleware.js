/**
 * Rate Limiter Middleware
 * ป้องกัน brute force attacks
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter สำหรับ registration
 * จำกัด 5 ครั้งต่อ 15 นาที
 */
const registrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 นาที
  max: 5,                     // จำกัด 5 ครั้ง
  message: {
    success: false,
    error: 'มีการพยายามสมัครมากเกินไป กรุณารอ 15 นาที'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`Registration rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'มีการพยายามสมัครมากเกินไป กรุณารอ 15 นาที'
    });
  }
});

/**
 * Rate limiter สำหรับ login
 * จำกัด 5 ครั้งต่อ 15 นาที
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 นาที
  max: 5,                     // จำกัด 5 ครั้ง
  message: {
    success: false,
    error: 'มีการพยายาม login มากเกินไป กรุณารอ 15 นาที'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`Login rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'มีการพยายาม login มากเกินไป กรุณารอ 15 นาที'
    });
  }
});

/**
 * Rate limiter สำหรับ reset password (Per IP)
 * จำกัด 5 ครั้งต่อ 15 นาที
 */
const resetPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'มีการพยายามรีเซ็ตรหัสผ่านมากเกินไป กรุณารอ 15 นาที'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`Reset password rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'มีการพยายามรีเซ็ตรหัสผ่านมากเกินไป กรุณารอ 15 นาที'
    });
  }
});

/**
 * Rate limiter สำหรับ reset password (Per ID Card)
 * จำกัด 3 ครั้งต่อวันต่อเลขบัตรประชาชน
 * ป้องกัน brute force เบอร์ผู้ติดต่อฉุกเฉิน
 */
const resetPasswordIdCardLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,  // 24 ชั่วโมง
  max: 3,                          // จำกัด 3 ครั้งต่อวัน
  skipSuccessfulRequests: true,    // นับแค่ครั้งที่ผิด
  keyGenerator: (req) => {
    // ใช้ id_card เป็น key
    return `reset_pwd_${req.body.id_card || 'unknown'}`;
  },
  message: {
    success: false,
    error: 'คุณได้ลองรีเซ็ตรหัสผ่านเกิน 3 ครั้งแล้ววันนี้ กรุณาลองใหม่พรุ่งนี้ หรือติดต่อเจ้าหน้าที่ที่โรงพยาบาล'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`Password reset limit exceeded for ID Card: ${req.body.id_card}`);
    res.status(429).json({
      success: false,
      error: 'คุณได้ลองรีเซ็ตรหัสผ่านเกิน 3 ครั้งแล้ววันนี้ กรุณาลองใหม่พรุ่งนี้ หรือติดต่อเจ้าหน้าที่ที่โรงพยาบาล'
    });
  }
});

module.exports = {
  registrationRateLimiter,
  loginRateLimiter,
  resetPasswordIpLimiter,
  resetPasswordIdCardLimiter
};