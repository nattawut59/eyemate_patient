/**
 * Auth Service
 * Business Logic สำหรับ Authentication
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database.config');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt.config');

/**
 * Generate User ID
 * สร้าง user_id ในรูปแบบ PAT + running number
 */
async function generateUserId() {
  try {
    // ดึง patient_id ล่าสุด
    const [rows] = await db.query(
      `SELECT patient_id 
       FROM PatientProfiles 
       ORDER BY patient_id DESC 
       LIMIT 1`
    );
    
    if (rows.length === 0) {
      // ถ้ายังไม่มี patient คนแรก
      return 'PAT0001';
    }
    
    // แยกเลข running number จาก patient_id
    const lastId = rows[0].patient_id;
    const numPart = parseInt(lastId.substring(3));
    const newNum = numPart + 1;
    
    // Format เป็น PAT + 4 หลัก (เช่น PAT0001, PAT0002)
    return 'PAT' + String(newNum).padStart(4, '0');
    
  } catch (error) {
    console.error('Error generating user ID:', error.message);
    throw error;
  }
}

/**
 * ตรวจสอบว่าเลขบัตรประชาชนซ้ำหรือไม่
 */
async function checkDuplicateIdCard(idCard) {
  try {
    const [rows] = await db.query(
      'SELECT user_id FROM users WHERE id_card = ?',
      [idCard]
    );
    
    return rows.length > 0;
  } catch (error) {
    console.error('Error checking duplicate ID card:', error.message);
    throw error;
  }
}

/**
 * Register Patient
 * สร้าง account ผู้ป่วยใหม่
 */
async function registerPatient(userData) {
  const connection = await db.getConnection();
  
  try {
    // เริ่ม transaction
    await connection.beginTransaction();
    
    // 1. ตรวจสอบเลขบัตรประชาชนซ้ำ
    const isDuplicate = await checkDuplicateIdCard(userData.id_card);
    if (isDuplicate) {
      throw {
        statusCode: 409,
        message: 'เลขบัตรประชาชนนี้มีในระบบแล้ว'
      };
    }
    
    // 2. Generate user_id
    const userId = await generateUserId();
    
    // 3. Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    // 4. Clean phone numbers (ลบช่องว่างและขีด)
    const cleanPhone = userData.phone.replace(/[\s-]/g, '');
    const cleanEmergencyPhone = userData.emergency_contact_phone.replace(/[\s-]/g, '');
    
    // 5. Insert into users table
    await connection.query(
      `INSERT INTO users (
        user_id, 
        id_card, 
        role, 
        username, 
        password_hash, 
        phone,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        userData.id_card,
        'patient',
        userData.id_card,  // username = id_card
        hashedPassword,
        cleanPhone,
        'active'
      ]
    );
    
    // 6. Insert into PatientProfiles table
    await connection.query(
      `INSERT INTO PatientProfiles (
        patient_id,
        first_name,
        last_name,
        date_of_birth,
        gender,
        address,
        emergency_contact_first_name,
        emergency_contact_last_name,
        emergency_contact_phone,
        emergency_contact_relation,
        consent_to_data_usage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        userData.first_name,
        userData.last_name,
        userData.date_of_birth,
        userData.gender,
        userData.address || null,
        userData.emergency_contact_first_name,
        userData.emergency_contact_last_name,
        cleanEmergencyPhone,
        userData.emergency_contact_relation,
        userData.consent_to_data_usage ? 1 : 0
      ]
    );
    
    // 7. Commit transaction
    await connection.commit();
    
    // 8. Return ข้อมูลผู้ใช้ (ไม่รวม password_hash)
    return {
      user_id: userId,
      id_card: userData.id_card,
      phone: cleanPhone,
      first_name: userData.first_name,
      last_name: userData.last_name,
      role: 'patient'
    };
    
  } catch (error) {
    // Rollback ถ้าเกิด error
    await connection.rollback();
    
    console.error('Error in registerPatient:', error.message);
    
    // ถ้าเป็น custom error (409)
    if (error.statusCode) {
      throw error;
    }
    
    // ถ้าเป็น database error
    throw {
      statusCode: 500,
      message: 'เกิดข้อผิดพลาดในการสมัครสมาชิก'
    };
    
  } finally {
    // ปิด connection เสมอ
    connection.release();
  }
}

/**
 * Login Patient
 * เข้าสู่ระบบและสร้าง JWT token
 */
async function loginPatient(idCard, password) {
  try {
    // 1. ค้นหา user จาก id_card
    const [users] = await db.query(
      `SELECT 
        u.user_id,
        u.id_card,
        u.password_hash,
        u.role,
        u.status,
        p.first_name,
        p.last_name
      FROM users u
      LEFT JOIN PatientProfiles p ON u.user_id = p.patient_id
      WHERE u.id_card = ?`,
      [idCard]
    );
    
    // 2. ตรวจสอบว่าพบ user หรือไม่
    if (users.length === 0) {
      throw {
        statusCode: 401,
        message: 'เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง'
      };
    }
    
    const user = users[0];
    
    // 3. ตรวจสอบสถานะ account
    if (user.status !== 'active') {
      throw {
        statusCode: 401,
        message: 'บัญชีของคุณถูกระงับ กรุณาติดต่อเจ้าหน้าที่'
      };
    }
    
    // 4. Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      throw {
        statusCode: 401,
        message: 'เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง'
      };
    }
    
    // 5. Update last_login
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE user_id = ?',
      [user.user_id]
    );
    
    // 6. สร้าง JWT token
    const token = jwt.sign(
      {
        userId: user.user_id,
        role: user.role,
        idCard: user.id_card
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    // 7. Return token และข้อมูล user (ไม่รวม password_hash)
    return {
      token,
      user: {
        user_id: user.user_id,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      }
    };
    
  } catch (error) {
    console.error('Error in loginPatient:', error.message);
    
    // ถ้าเป็น custom error (401)
    if (error.statusCode) {
      throw error;
    }
    
    // ถ้าเป็น unexpected error
    throw {
      statusCode: 500,
      message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
    };
  }
}

/**
 * Reset Password
 * รีเซ็ตรหัสผ่านโดยใช้เลขบัตรประชาชนและเบอร์ผู้ติดต่อฉุกเฉินยืนยันตัวตน
 */
async function resetPassword(idCard, emergencyPhone, newPassword) {
  try {
    // 1. Clean emergency phone (ลบช่องว่างและขีด)
    const cleanEmergencyPhone = emergencyPhone.replace(/[\s-]/g, '');
    
    // 2. ยืนยันตัวตนด้วยเลขบัตรประชาชนและเบอร์ผู้ติดต่อฉุกเฉิน
    const [users] = await db.query(
      `SELECT 
        u.user_id,
        u.id_card,
        u.phone,
        u.status,
        p.first_name,
        p.last_name,
        p.emergency_contact_phone,
        p.emergency_contact_first_name,
        p.emergency_contact_last_name
      FROM users u
      INNER JOIN PatientProfiles p ON u.user_id = p.patient_id
      WHERE u.id_card = ? AND p.emergency_contact_phone = ?`,
      [idCard, cleanEmergencyPhone]
    );
    
    // 3. ตรวจสอบว่าพบ user หรือไม่
    if (users.length === 0) {
      throw {
        statusCode: 404,
        message: 'ไม่พบข้อมูลผู้ใช้ หรือข้อมูลไม่ถูกต้อง'
      };
    }
    
    const user = users[0];
    
    // 4. ตรวจสอบสถานะ account
    if (user.status !== 'active') {
      throw {
        statusCode: 401,
        message: 'บัญชีของคุณถูกระงับ กรุณาติดต่อเจ้าหน้าที่'
      };
    }
    
    // 5. Hash password ใหม่
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // 6. Update password และตั้งค่าให้เปลี่ยนรหัสผ่านในครั้งถัดไป
    await db.query(
      `UPDATE users 
       SET password_hash = ?, 
           require_password_change = 1,
           updated_at = NOW()
       WHERE user_id = ?`,
      [hashedPassword, user.user_id]
    );
    
    // 7. Log การรีเซ็ตรหัสผ่าน (Audit Trail)
    console.log('='.repeat(60));
    console.log('🔐 PASSWORD RESET SUCCESSFUL');
    console.log('='.repeat(60));
    console.log(`User ID: ${user.user_id}`);
    console.log(`Name: ${user.first_name} ${user.last_name}`);
    console.log(`ID Card: ${idCard}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    
    // 8. Return ข้อมูลผู้ใช้
    return {
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      message: 'รีเซ็ตรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่'
    };
    
  } catch (error) {
    console.error('Error in resetPassword:', error.message);
    
    // ถ้าเป็น custom error
    if (error.statusCode) {
      throw error;
    }
    
    // ถ้าเป็น unexpected error
    throw {
      statusCode: 500,
      message: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน'
    };
  }
}

module.exports = {
  registerPatient,
  loginPatient,
  resetPassword,
  checkDuplicateIdCard
};