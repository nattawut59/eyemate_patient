/**
 * Auth Controller
 * จัดการ HTTP requests/responses สำหรับ authentication
 */

const authService = require('../services/auth.service');

/**
 * Register Patient
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    // ข้อมูลจาก request body (ผ่าน validation middleware แล้ว)
    const userData = {
      id_card: req.body.id_card,
      password: req.body.password,
      phone: req.body.phone,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      date_of_birth: req.body.date_of_birth,
      gender: req.body.gender,
      address: req.body.address,
      emergency_contact_first_name: req.body.emergency_contact_first_name,
      emergency_contact_last_name: req.body.emergency_contact_last_name,
      emergency_contact_phone: req.body.emergency_contact_phone,
      emergency_contact_relation: req.body.emergency_contact_relation,
      consent_to_data_usage: req.body.consent_to_data_usage
    };
    
    // เรียก service เพื่อสมัครสมาชิก
    const result = await authService.registerPatient(userData);
    
    // ส่ง response กลับ
    return res.status(201).json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ',
      data: result
    });
    
  } catch (error) {
    console.error('Error in register controller:', error.message);
    
    // ถ้าเป็น custom error (มี statusCode)
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }
    
    // ถ้าเป็น unexpected error
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในระบบ'
    });
  }
}
/**
 * Login Patient
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    // ข้อมูลจาก request body (ผ่าน validation middleware แล้ว)
    const { id_card, password } = req.body;
    
    // เรียก service เพื่อ login
    const result = await authService.loginPatient(id_card, password);
    
    // ส่ง response กลับ
    return res.status(200).json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      data: result
    });
    
  } catch (error) {
    console.error('Error in login controller:', error.message);
    
    // ถ้าเป็น custom error (มี statusCode)
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }
    
    // ถ้าเป็น unexpected error
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในระบบ'
    });
  }
}

/**
 * Reset Password
 * รีเซ็ตรหัสผ่าน (ใช้เลขบัตร + เบอร์ผู้ติดต่อฉุกเฉินยืนยันตัวตน)
 */
async function resetPassword(req, res) {
  try {
    const { id_card, emergency_phone, new_password } = req.body;
    
    // เรียก service เพื่อรีเซ็ตรหัสผ่าน
    const result = await authService.resetPassword(id_card, emergency_phone, new_password);
    
    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        user_id: result.user_id,
        first_name: result.first_name,
        last_name: result.last_name
      }
    });
    
  } catch (error) {
    console.error('Reset password error:', error.message);
    
    // Handle custom errors
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }
    
    // Handle unexpected errors
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน'
    });
  }
}

module.exports = {
  register,
  login,
  resetPassword
};