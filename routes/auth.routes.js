/**
 * Authentication Routes
 * เส้นทาง API สำหรับ authentication
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validateRegistration, validateLogin, validateResetPassword } = require('../middleware/validation.middleware');
const { registrationRateLimiter, loginRateLimiter,resetPasswordIpLimiter,resetPasswordIdCardLimiter} = require('../middleware/rateLimiter.middleware');

/**
 * @route   POST /api/auth/register
 * @desc    ลงทะเบียนผู้ใช้ใหม่ (patient)
 * @access  Public
 */
router.post('/register',
  registrationRateLimiter,    // Rate limiting (5 ครั้ง/15 นาที)
  validateRegistration,        // Validation middleware
  authController.register      // Controller
);

/**
 * @route   POST /api/auth/login
 * @desc    เข้าสู่ระบบ
 * @access  Public
 */
router.post('/login',
  loginRateLimiter,           // Rate limiting (5 ครั้ง/15 นาที)
  validateLogin,              // Validation middleware
  authController.login        // Controller
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    รีเซ็ตรหัสผ่าน (ใช้เลขบัตรประชาชน + เบอร์ผู้ติดต่อฉุกเฉินยืนยันตัวตน)
 * @access  Public
 */
router.post('/reset-password',
  resetPasswordIpLimiter,         // Rate limiting ชั้นที่ 1: 5 ครั้ง/15 นาที ต่อ IP
  resetPasswordIdCardLimiter,     // Rate limiting ชั้นที่ 2: 3 ครั้ง/วัน ต่อเลขบัตร
  validateResetPassword,          // Validation middleware
  authController.resetPassword    // Controller
);

module.exports = router;