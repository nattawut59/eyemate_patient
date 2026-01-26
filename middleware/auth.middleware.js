const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt.config');

/**
 * Middleware สำหรับตรวจสอบ JWT Token
 */
const verifyToken = (req, res, next) => {
  try {
    // ดึง token จาก header
    const authHeader = req.headers.authorization;
    
    // ✅ เพิ่ม logging
    console.log('🔍 [verifyToken] Auth Header:', authHeader ? 'มี' : 'ไม่มี');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ [verifyToken] ไม่พบ token หรือรูปแบบไม่ถูกต้อง');
      return res.status(401).json({
        success: false,
        error: 'ไม่พบ token หรือรูปแบบไม่ถูกต้อง'
      });
    }
    
    // แยก token จาก "Bearer "
    const token = authHeader.split(' ')[1];
    console.log('🔍 [verifyToken] Token:', token.substring(0, 20) + '...');
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ [verifyToken] Token verified successfully');
    console.log('🔍 [verifyToken] User:', { userId: decoded.userId, role: decoded.role });
    
    // เก็บข้อมูล user ใน request
    req.user = decoded;
    
    next();
    
  } catch (error) {
    console.log('❌ [verifyToken] Error:', error.name, '-', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token หมดอายุ'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token ไม่ถูกต้อง'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการตรวจสอบ token'
    });
  }
};

/**
 * Middleware สำหรับตรวจสอบ Role
 * @param {array} allowedRoles - roles ที่อนุญาต เช่น ['patient', 'admin']
 */
const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      console.log('🔍 [verifyRole] Checking role...');
      console.log('🔍 [verifyRole] User role:', req.user?.role);
      console.log('🔍 [verifyRole] Allowed roles:', allowedRoles);
      
      // ตรวจสอบว่ามี user ใน request หรือไม่
      if (!req.user) {
        console.log('❌ [verifyRole] ไม่พบข้อมูลผู้ใช้ใน request');
        return res.status(401).json({
          success: false,
          error: 'ไม่พบข้อมูลผู้ใช้'
        });
      }
      
      // ตรวจสอบ role
      if (!allowedRoles.includes(req.user.role)) {
        console.log('❌ [verifyRole] Role ไม่ตรงกับที่อนุญาต');
        return res.status(403).json({
          success: false,
          error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้'
        });
      }
      
      console.log('✅ [verifyRole] Role verified successfully');
      next();
      
    } catch (error) {
      console.log('❌ [verifyRole] Error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์'
      });
    }
  };
};

module.exports = { verifyToken, verifyRole };