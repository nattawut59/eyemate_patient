const patientService = require('../services/patient.service');

/**
 * Controller สำหรับดูรายการนัดหมายของผู้ป่วย
 */
const getAppointments = async (req, res) => {
  try {
    console.log('📋 [getAppointments] เริ่มดึงข้อมูลนัดหมาย');
    
    // ดึง patient_id จาก JWT token
    const patientId = req.user.userId;
    console.log('🔍 [getAppointments] Patient ID:', patientId);
    
    // ดึง status จาก query params (default = "upcoming")
    const status = req.query.status || 'upcoming';
    console.log('🔍 [getAppointments] Status filter:', status);
    
    // เรียก service layer
    const appointments = await patientService.getAppointments(patientId, status);
    console.log('✅ [getAppointments] พบนัดหมาย:', appointments.length, 'รายการ');
    
    return res.status(200).json({
      success: true,
      data: appointments,
      message: 'ดึงข้อมูลนัดหมายสำเร็จ'
    });
    
  } catch (error) {
    console.error('❌ [getAppointments] Error:', error.message);
    console.error('❌ [getAppointments] Stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย'
    });
  }
};

/**
 * Controller สำหรับขอเลื่อนนัดหมาย
 */
const requestAppointmentChange = async (req, res) => {
  try {
    console.log('📝 [requestAppointmentChange] เริ่มประมวลผลคำขอเลื่อนนัด');
    
    const patientId = req.user.userId;
    console.log('🔍 [requestAppointmentChange] Patient ID:', patientId);
    
    const requestData = {
      appointment_id: req.body.appointment_id,
      requested_date: req.body.requested_date,
      requested_time: req.body.requested_time,
      reason: req.body.reason
    };
    console.log('🔍 [requestAppointmentChange] Request Data:', requestData);
    
    // เรียก service layer
    const result = await patientService.createAppointmentRequest(patientId, requestData);
    
    if (!result.success) {
      console.log('❌ [requestAppointmentChange] ไม่สำเร็จ:', result.error);
      return res.status(result.statusCode).json({
        success: false,
        error: result.error
      });
    }
    
    console.log('✅ [requestAppointmentChange] สำเร็จ');
    
    return res.status(result.statusCode).json({
      success: true,
      data: result.data,
      message: result.data.message
    });
    
  } catch (error) {
    console.error('❌ [requestAppointmentChange] Error:', error.message);
    console.error('❌ [requestAppointmentChange] Stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่งคำขอเลื่อนนัด'
    });
  }
};

/**
 * Controller สำหรับดูรายการคำขอเลื่อนนัด
 */
const getAppointmentRequests = async (req, res) => {
  try {
    console.log('📋 [getAppointmentRequests] เริ่มดึงข้อมูลคำขอเลื่อนนัด');
    
    const patientId = req.user.userId;
    console.log('🔍 [getAppointmentRequests] Patient ID:', patientId);
    
    // เรียก service layer
    const requests = await patientService.getAppointmentRequests(patientId);
    console.log('✅ [getAppointmentRequests] พบคำขอ:', requests.length, 'รายการ');
    
    return res.status(200).json({
      success: true,
      data: requests,
      message: 'ดึงข้อมูลคำขอเลื่อนนัดสำเร็จ'
    });
    
  } catch (error) {
    console.error('❌ [getAppointmentRequests] Error:', error.message);
    console.error('❌ [getAppointmentRequests] Stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำขอเลื่อนนัด'
    });
  }
};

/**
 * ดูโปรไฟล์ผู้ป่วย
 */
async function getProfile(req, res) {
  try {
    console.log('[Patient Controller] Getting profile for user:', req.user.userId);
    
    // ดึง userId จาก JWT token
    const userId = req.user.userId;
    
    // เรียก service เพื่อดึงข้อมูล
    const profile = await patientService.getProfile(userId);
    
    return res.status(200).json({
      success: true,
      data: profile
    });
    
  } catch (error) {
    console.error('[Patient Controller] Get profile error:', error.message);
    
    if (error.message === 'ไม่พบข้อมูลผู้ป่วย') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลโปรไฟล์'
    });
  }
}

/**
 * แก้ไขโปรไฟล์ผู้ป่วย
 */
async function updateProfile(req, res) {
  try {
    console.log('[Patient Controller] Updating profile for user:', req.user.userId);
    
    const userId = req.user.userId;
    const updateData = req.body;
    
    // เรียก service เพื่ออัพเดตข้อมูล
    const updatedProfile = await patientService.updateProfile(userId, updateData);
    
    return res.status(200).json({
      success: true,
      message: 'อัพเดตโปรไฟล์สำเร็จ',
      data: updatedProfile
    });
    
  } catch (error) {
    console.error('[Patient Controller] Update profile error:', error.message);
    
    if (error.message === 'ไม่พบข้อมูลผู้ป่วย') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.message.includes('validation') || error.message.includes('ไม่ถูกต้อง')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัพเดตโปรไฟล์'
    });
  }
};

/**
 * บันทึกประวัติครอบครัวเกี่ยวกับโรคต้อหิน
 */
async function addFamilyHistory(req, res) {
  try {
    console.log('[Patient Controller] Adding family history for user:', req.user.userId);
    
    const patientId = req.user.userId;
    const historyData = req.body;
    
    // เรียก service
    const result = await patientService.addFamilyHistory(patientId, historyData);
    
    return res.status(201).json({
      success: true,
      message: 'บันทึกประวัติครอบครัวสำเร็จ',
      data: {
        history_id: result.history_id
      }
    });
    
  } catch (error) {
    console.error('[Patient Controller] Add family history error:', error.message);
    
    if (error.message.includes('validation') || 
        error.message.includes('ไม่ถูกต้อง') ||
        error.message.includes('กรุณา')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการบันทึกประวัติครอบครัว'
    });
  }
}

/**
 * ดูประวัติครอบครัวเกี่ยวกับโรคต้อหิน
 */
async function getFamilyHistory(req, res) {
  try {
    console.log('[Patient Controller] Getting family history for user:', req.user.userId);
    
    const patientId = req.user.userId;
    
    // เรียก service
    const history = await patientService.getFamilyHistory(patientId);
    
    return res.status(200).json({
      success: true,
      data: history
    });
    
  } catch (error) {
    console.error('[Patient Controller] Get family history error:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติครอบครัว'
    });
  }
}

// ============================================
// Eye Trauma History Functions (เพิ่มใหม่)
// ============================================

/**
 * บันทึกประวัติอุบัติเหตุทางตา
 */
async function addEyeTraumaHistory(req, res) {
  try {
    console.log('[Patient Controller] Adding eye trauma history for user:', req.user.userId);
    
    const patientId = req.user.userId;
    const traumaData = req.body;
    
    // เรียก service
    const result = await patientService.addEyeTraumaHistory(patientId, traumaData);
    
    return res.status(201).json({
      success: true,
      message: 'บันทึกประวัติอุบัติเหตุทางตาสำเร็จ',
      data: {
        history_id: result.history_id
      }
    });
    
  } catch (error) {
    console.error('[Patient Controller] Add eye trauma history error:', error.message);
    
    if (error.message.includes('validation') || 
        error.message.includes('ไม่ถูกต้อง') ||
        error.message.includes('กรุณา')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการบันทึกประวัติอุบัติเหตุทางตา'
    });
  }
}

/**
 * ดูประวัติอุบัติเหตุทางตา
 */
async function getEyeTraumaHistory(req, res) {
  try {
    console.log('[Patient Controller] Getting eye trauma history for user:', req.user.userId);
    
    const patientId = req.user.userId;
    
    // เรียก service
    const history = await patientService.getEyeTraumaHistory(patientId);
    
    return res.status(200).json({
      success: true,
      data: history
    });
    
  } catch (error) {
    console.error('[Patient Controller] Get eye trauma history error:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติอุบัติเหตุทางตา'
    });
  }
}


module.exports = {
  getAppointments,
  requestAppointmentChange,
  getAppointmentRequests,
  getProfile,
  updateProfile,
  addFamilyHistory,
  getFamilyHistory,
  addEyeTraumaHistory,
  getEyeTraumaHistory
};