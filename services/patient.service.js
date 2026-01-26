const db = require('../config/database.config');

/**
 * Service สำหรับดึงข้อมูลนัดหมายของผู้ป่วย
 * 
 * @param {string} patientId - ID ของผู้ป่วย
 * @param {string} status - "upcoming" | "past" | "all"
 * @returns {Promise<Array>} รายการนัดหมาย
 */
const getAppointments = async (patientId, status) => {
  try {
    let query = `
      SELECT 
        a.appointment_id,
        a.appointment_date,
        a.appointment_time,
        a.appointment_type,
        a.appointment_location,
        a.appointment_duration,
        a.appointment_status,
        a.notes,
        CONCAT(d.first_name, ' ', d.last_name) AS doctor_name,
        d.specialty AS doctor_specialty,
        a.created_at,
        a.updated_at
      FROM Appointments a
      INNER JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
      WHERE a.patient_id = ?
    `;
    
    const params = [patientId];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // ✅ Filter ตาม status
    if (status === 'upcoming') {
      // นัดหมายในอนาคต (วันนี้และหลังจากนี้)
      query += ` AND a.appointment_date >= ?`;
      query += ` AND a.appointment_status IN ('scheduled', 'rescheduled')`;
      params.push(today);
      
    } else if (status === 'past') {
      // นัดหมายที่ผ่านมาแล้ว
      query += ` AND a.appointment_date < ?`;
      params.push(today);
      
    }
    // ถ้าเป็น "all" ไม่ต้องเพิ่ม WHERE clause
    
    // ✅ เรียงตามวันที่
    if (status === 'upcoming') {
      query += ` ORDER BY a.appointment_date ASC, a.appointment_time ASC`;
    } else {
      query += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC`;
    }
    
    // ✅ Execute query ด้วย prepared statement
    const [appointments] = await db.query(query, params);
    
    // ✅ Format response data
    const formattedAppointments = appointments.map(appointment => ({
      appointment_id: appointment.appointment_id,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      appointment_type: appointment.appointment_type || 'ตรวจทั่วไป',
      appointment_location: appointment.appointment_location || 'คลินิกตา',
      appointment_duration: appointment.appointment_duration || 30,
      status: appointment.appointment_status,
      doctor_name: appointment.doctor_name,
      doctor_specialty: appointment.doctor_specialty || 'จักษุแพทย์',
      notes: appointment.notes || null,
      created_at: appointment.created_at,
      updated_at: appointment.updated_at
    }));
    
    return formattedAppointments;
    
  } catch (error) {
    console.error('Error in getAppointments service:', error.message);
    throw new Error('เกิดข้อผิดพลาดในการดึงข้อมูลจากฐานข้อมูล');
  }
};

const verifyAppointmentOwnership = async (appointmentId, patientId) => {
  try {
    const [appointments] = await db.query(
      `SELECT appointment_id, patient_id, appointment_status, appointment_date
       FROM Appointments 
       WHERE appointment_id = ? AND patient_id = ?`,
      [appointmentId, patientId]
    );
    
    if (appointments.length === 0) {
      return { 
        valid: false, 
        message: 'ไม่พบนัดหมายนี้ หรือนัดหมายนี้ไม่ใช่ของคุณ' 
      };
    }
    
    const appointment = appointments[0];
    
    // ตรวจสอบว่านัดหมายยังไม่ผ่านไป
    const today = new Date().toISOString().split('T')[0];
    if (appointment.appointment_date < today) {
      return { 
        valid: false, 
        message: 'ไม่สามารถขอเลื่อนนัดที่ผ่านมาแล้วได้' 
      };
    }
    
    // ตรวจสอบสถานะนัดหมาย
    if (appointment.appointment_status === 'cancelled') {
      return { 
        valid: false, 
        message: 'ไม่สามารถขอเลื่อนนัดที่ถูกยกเลิกแล้วได้' 
      };
    }
    
    if (appointment.appointment_status === 'completed') {
      return { 
        valid: false, 
        message: 'ไม่สามารถขอเลื่อนนัดที่เสร็จสิ้นแล้วได้' 
      };
    }
    
    return { valid: true, appointment };
    
  } catch (error) {
    console.error('Error in verifyAppointmentOwnership:', error.message);
    throw error;
  }
};

/**
 * ตรวจสอบว่ามีคำขอเลื่อนนัดที่รอดำเนินการอยู่หรือไม่
 */
const checkPendingRequest = async (appointmentId, patientId) => {
  try {
    const [requests] = await db.query(
      `SELECT request_id, request_status
       FROM AppointmentChangeRequests 
       WHERE appointment_id = ? 
       AND patient_id = ? 
       AND request_status = 'pending'`,
      [appointmentId, patientId]
    );
    
    if (requests.length > 0) {
      return { 
        hasPending: true, 
        message: 'มีคำขอเลื่อนนัดที่รอดำเนินการอยู่แล้ว กรุณารอการอนุมัติก่อน' 
      };
    }
    
    return { hasPending: false };
    
  } catch (error) {
    console.error('Error in checkPendingRequest:', error.message);
    throw error;
  }
};

/**
 * สร้างคำขอเลื่อนนัดหมาย
 */
const createAppointmentRequest = async (patientId, requestData) => {
  const connection = await db.getConnection();
  
  try {
    // เริ่ม transaction
    await connection.beginTransaction();
    
    const { appointment_id, requested_date, requested_time, reason } = requestData;
    
    // 1. ตรวจสอบว่านัดหมายเป็นของ patient นี้
    const ownershipCheck = await verifyAppointmentOwnership(appointment_id, patientId);
    if (!ownershipCheck.valid) {
      await connection.rollback();
      return { 
        success: false, 
        statusCode: 404, 
        error: ownershipCheck.message 
      };
    }
    
    // 2. ตรวจสอบว่ามีคำขอที่รอดำเนินการอยู่หรือไม่
    const pendingCheck = await checkPendingRequest(appointment_id, patientId);
    if (pendingCheck.hasPending) {
      await connection.rollback();
      return { 
        success: false, 
        statusCode: 409, 
        error: pendingCheck.message 
      };
    }
    
    // 3. สร้าง request_id
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const request_id = `REQ${timestamp}${random}`;
    
    // 4. บันทึกคำขอลง database
    await connection.query(
      `INSERT INTO AppointmentChangeRequests (
        request_id,
        appointment_id,
        patient_id,
        request_type,
        requested_new_date,
        requested_new_time,
        reason,
        request_status,
        created_at
      ) VALUES (?, ?, ?, 'reschedule', ?, ?, ?, 'pending', NOW())`,
      [request_id, appointment_id, patientId, requested_date, requested_time, reason]
    );
    
    // Commit transaction
    await connection.commit();
    
    console.log('✅ [createAppointmentRequest] สร้างคำขอสำเร็จ:', request_id);
    
    return {
      success: true,
      statusCode: 201,
      data: {
        request_id,
        appointment_id,
        requested_date,
        requested_time,
        reason,
        status: 'pending',
        message: 'ส่งคำขอเลื่อนนัดสำเร็จ รอการอนุมัติจากเจ้าหน้าที่'
      }
    };
    
  } catch (error) {
    // Rollback ถ้าเกิด error
    await connection.rollback();
    console.error('❌ [createAppointmentRequest] Error:', error.message);
    throw error;
    
  } finally {
    // ปิด connection เสมอ
    connection.release();
  }
};

/**
 * ดึงรายการคำขอเลื่อนนัดทั้งหมดของผู้ป่วย
 * 
 * @param {string} patientId - ID ของผู้ป่วย
 * @returns {Promise<Array>} รายการคำขอเลื่อนนัด
 */
const getAppointmentRequests = async (patientId) => {
  try {
    const query = `
      SELECT 
        acr.request_id,
        acr.appointment_id,
        acr.request_type,
        acr.requested_new_date AS requested_date,
        acr.requested_new_time AS requested_time,
        acr.reason,
        acr.request_status AS status,
        acr.action_by_id,
        acr.action_date,
        acr.admin_notes,
        acr.created_at,
        a.appointment_date AS original_date,
        a.appointment_time AS original_time,
        a.appointment_type,
        a.appointment_location,
        a.appointment_status,
        CONCAT(d.first_name, ' ', d.last_name) AS doctor_name,
        d.specialty AS doctor_specialty
      FROM AppointmentChangeRequests acr
      INNER JOIN Appointments a ON acr.appointment_id = a.appointment_id
      INNER JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
      WHERE acr.patient_id = ?
      ORDER BY acr.created_at DESC
    `;
    
    const [requests] = await db.query(query, [patientId]);
    
    // Format response data
    const formattedRequests = requests.map(request => ({
      request_id: request.request_id,
      appointment_id: request.appointment_id,
      request_type: request.request_type,
      
      // ข้อมูลนัดเดิม
      original_date: request.original_date,
      original_time: request.original_time,
      appointment_type: request.appointment_type || 'ตรวจทั่วไป',
      appointment_location: request.appointment_location || 'คลินิกตา',
      appointment_status: request.appointment_status,
      
      // ข้อมูลที่ขอเลื่อน
      requested_date: request.requested_date,
      requested_time: request.requested_time,
      reason: request.reason,
      
      // สถานะคำขอ
      status: request.status,
      status_text: getStatusText(request.status),
      
      // ข้อมูลการอนุมัติ/ปฏิเสธ
      action_by_id: request.action_by_id || null,
      action_date: request.action_date || null,
      admin_notes: request.admin_notes || null,
      
      // ข้อมูลหมอ
      doctor_name: request.doctor_name,
      doctor_specialty: request.doctor_specialty || 'จักษุแพทย์',
      
      // วันที่สร้างคำขอ
      created_at: request.created_at
    }));
    
    return formattedRequests;
    
  } catch (error) {
    console.error('❌ Error in getAppointmentRequests service:', error.message);
    throw new Error('เกิดข้อผิดพลาดในการดึงข้อมูลจากฐานข้อมูล');
  }
};

/**
 * แปลง status เป็นข้อความภาษาไทย
 */
function getStatusText(status) {
  const statusMap = {
    'pending': 'รอดำเนินการ',
    'approved': 'อนุมัติ',
    'rejected': 'ปฏิเสธ'
  };
  
  return statusMap[status] || status;
}

/**
 * ดึงข้อมูลโปรไฟล์ผู้ป่วย
 * @param {string} userId - Patient ID
 * @returns {object} - ข้อมูลโปรไฟล์ผู้ป่วย
 */
async function getProfile(userId) {
  try {
    console.log('[Patient Service] Fetching profile for user:', userId);
    
    // Query ข้อมูลจาก users JOIN PatientProfiles
    const [rows] = await db.query(
      `SELECT 
        u.user_id,
        u.id_card,
        u.phone AS user_phone,
        u.role,
        u.created_at AS account_created_at,
        u.last_login,
        u.status AS account_status,
        p.patient_id,
        p.patient_hn,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.gender,
        p.address,
        p.emergency_contact_first_name,
        p.emergency_contact_last_name,
        p.emergency_contact_phone,
        p.emergency_contact_relation,
        p.consent_to_data_usage,
        p.registration_date
      FROM users u
      LEFT JOIN PatientProfiles p ON u.user_id = p.patient_id
      WHERE u.user_id = ? AND u.role = 'patient'`,
      [userId]
    );
    
    if (rows.length === 0) {
      throw new Error('ไม่พบข้อมูลผู้ป่วย');
    }
    
    const profile = rows[0];
    
    // คำนวณอายุจากวันเกิด
    if (profile.date_of_birth) {
      const today = new Date();
      const birthDate = new Date(profile.date_of_birth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      profile.age = age;
    }
    
    console.log('[Patient Service] Profile fetched successfully');
    return profile;
    
  } catch (error) {
    console.error('[Patient Service] Get profile error:', error.message);
    throw error;
  }
}

/**
 * อัพเดตโปรไฟล์ผู้ป่วย
 * @param {string} userId - Patient ID
 * @param {object} updateData - ข้อมูลที่ต้องการอัพเดต
 * @returns {object} - ข้อมูลโปรไฟล์ที่อัพเดตแล้ว
 */
async function updateProfile(userId, updateData) {
  const connection = await db.getConnection();
  
  try {
    console.log('[Patient Service] Updating profile for user:', userId);
    
    await connection.beginTransaction();
    
    // ตรวจสอบว่าผู้ป่วยมีอยู่จริง
    const [patients] = await connection.query(
      'SELECT patient_id FROM PatientProfiles WHERE patient_id = ?',
      [userId]
    );
    
    if (patients.length === 0) {
      throw new Error('ไม่พบข้อมูลผู้ป่วย');
    }
    
    // --- Validation ---
    
    // 1. เบอร์โทรศัพท์
    if (updateData.phone) {
      const phoneRegex = /^0[89][0-9]{8}$/;
      const cleanPhone = updateData.phone.replace(/[\s-]/g, '');
      
      if (!phoneRegex.test(cleanPhone)) {
        throw new Error('เบอร์โทรศัพท์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย 08 หรือ 09 และมี 10 หลัก)');
      }
      
      updateData.phone = cleanPhone;
    }
    
    // 2. เบอร์ผู้ติดต่อฉุกเฉิน
    if (updateData.emergency_contact_phone) {
      const phoneRegex = /^0[89][0-9]{8}$/;
      const cleanPhone = updateData.emergency_contact_phone.replace(/[\s-]/g, '');
      
      if (!phoneRegex.test(cleanPhone)) {
        throw new Error('เบอร์ผู้ติดต่อฉุกเฉินไม่ถูกต้อง');
      }
      
      updateData.emergency_contact_phone = cleanPhone;
    }
    
    // 3. ที่อยู่ (optional - ถ้ามี)
    if (updateData.address && updateData.address.trim()) {
      const trimmedAddress = updateData.address.trim();
      
      if (trimmedAddress.length < 10) {
        throw new Error('ที่อยู่ต้องมีความยาวอย่างน้อย 10 ตัวอักษร');
      }
      
      if (trimmedAddress.length > 500) {
        throw new Error('ที่อยู่ต้องไม่เกิน 500 ตัวอักษร');
      }
      
      updateData.address = trimmedAddress;
    }
    
    // 4. ชื่อผู้ติดต่อฉุกเฉิน
    if (updateData.emergency_contact_first_name) {
      const trimmed = updateData.emergency_contact_first_name.trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        throw new Error('ชื่อผู้ติดต่อฉุกเฉินต้องมี 2-100 ตัวอักษร');
      }
      updateData.emergency_contact_first_name = trimmed;
    }
    
    // 5. นามสกุลผู้ติดต่อฉุกเฉิน
    if (updateData.emergency_contact_last_name) {
      const trimmed = updateData.emergency_contact_last_name.trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        throw new Error('นามสกุลผู้ติดต่อฉุกเฉินต้องมี 2-100 ตัวอักษร');
      }
      updateData.emergency_contact_last_name = trimmed;
    }
    
    // 6. ความสัมพันธ์ผู้ติดต่อฉุกเฉิน
    if (updateData.emergency_contact_relation) {
      const trimmed = updateData.emergency_contact_relation.trim();
      if (!trimmed) {
        throw new Error('กรุณาระบุความสัมพันธ์');
      }
      if (trimmed.length > 50) {
        throw new Error('ความสัมพันธ์ต้องไม่เกิน 50 ตัวอักษร');
      }
      updateData.emergency_contact_relation = trimmed;
    }
    
    // --- อัพเดตข้อมูล ---
    
    // ฟิลด์ที่อนุญาตให้แก้ไขได้
    const allowedFields = [
      'phone',
      'address',
      'emergency_contact_first_name',
      'emergency_contact_last_name',
      'emergency_contact_phone',
      'emergency_contact_relation'
    ];
    
    // ฟิลด์ที่ต้องอัพเดตใน users table
    const userFields = ['phone'];
    
    // ฟิลด์ที่ต้องอัพเดตใน PatientProfiles table
    const patientFields = allowedFields.filter(f => !userFields.includes(f));
    
    // อัพเดต users table (ถ้ามีการแก้ไข phone)
    if (updateData.phone) {
      await connection.query(
        'UPDATE users SET phone = ? WHERE user_id = ?',
        [updateData.phone, userId]
      );
      console.log('[Patient Service] Updated phone in users table');
    }
    
    // สร้าง dynamic query สำหรับ PatientProfiles table
    const patientUpdates = {};
    patientFields.forEach(field => {
      if (updateData[field] !== undefined) {
        patientUpdates[field] = updateData[field];
      }
    });
    
    // อัพเดต PatientProfiles table (ถ้ามีฟิลด์ที่ต้องอัพเดต)
    if (Object.keys(patientUpdates).length > 0) {
      const setClause = Object.keys(patientUpdates)
        .map(field => `${field} = ?`)
        .join(', ');
      
      const values = Object.values(patientUpdates);
      values.push(userId);
      
      await connection.query(
        `UPDATE PatientProfiles SET ${setClause} WHERE patient_id = ?`,
        values
      );
      
      console.log('[Patient Service] Updated PatientProfiles:', Object.keys(patientUpdates));
    }
    
    await connection.commit();
    
    // ดึงข้อมูลใหม่หลังอัพเดต
    const updatedProfile = await getProfile(userId);
    
    console.log('[Patient Service] Profile updated successfully');
    return updatedProfile;
    
  } catch (error) {
    await connection.rollback();
    console.error('[Patient Service] Update profile error:', error.message);
    throw error;
    
  } finally {
    connection.release();
  }
}

/**
 * บันทึกประวัติครอบครัวเกี่ยวกับโรคต้อหิน
 */
async function addFamilyHistory(patientId, historyData) {
  const connection = await db.getConnection();
  
  try {
    console.log('[Patient Service] Adding family history for patient:', patientId);
    
    await connection.beginTransaction();
    
    // Validation
    if (typeof historyData.has_family_history !== 'boolean') {
      throw new Error('กรุณาระบุว่าผู้ป่วยมีประวัติครอบครัวหรือไม่');
    }
    
    if (!historyData.has_family_history) {
      const historyId = `HIST${Date.now()}${Math.floor(Math.random() * 1000)}`;
      
      await connection.query(
        `INSERT INTO PatientMedicalHistory (
          history_id,
          patient_id,
          condition_type,
          condition_name,
          current_status,
          notes,
          recorded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          historyId,
          patientId,
          'other',
          'No family history of glaucoma',
          'resolved',
          'ไม่มีประวัติครอบครัวเกี่ยวกับโรคต้อหิน',
          patientId
        ]
      );
      
      await connection.commit();
      
      console.log('[Patient Service] Family history recorded (no history)');
      return { history_id: historyId };
    }
    
    const allowedRelations = [
      'พ่อ', 'แม่', 'พี่', 'น้อง', 
      'ปู่', 'ย่า', 'ตา', 'ยาย', 'อื่นๆ'
    ];
    
    if (!historyData.relation || !historyData.relation.trim()) {
      throw new Error('กรุณาระบุความสัมพันธ์');
    }
    
    const relation = historyData.relation.trim();
    
    if (!allowedRelations.includes(relation)) {
      throw new Error(`ความสัมพันธ์ต้องเป็นหนึ่งใน: ${allowedRelations.join(', ')}`);
    }
    
    const allowedConditions = ['glaucoma', 'ocular_hypertension', 'other'];
    
    if (!historyData.condition) {
      throw new Error('กรุณาระบุโรค');
    }
    
    if (!allowedConditions.includes(historyData.condition)) {
      throw new Error(`โรคต้องเป็นหนึ่งใน: ${allowedConditions.join(', ')}`);
    }
    
    let diagnosisAge = null;
    if (historyData.diagnosis_age !== undefined && historyData.diagnosis_age !== null) {
      diagnosisAge = parseInt(historyData.diagnosis_age);
      
      if (isNaN(diagnosisAge) || diagnosisAge < 0 || diagnosisAge > 150) {
        throw new Error('อายุเมื่อวินิจฉัยไม่ถูกต้อง (ต้องอยู่ระหว่าง 0-150)');
      }
    }
    
    const notes = historyData.notes ? historyData.notes.trim() : null;
    
    const historyId = `HIST${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    const conditionNames = {
      'glaucoma': 'โรคต้อหิน',
      'ocular_hypertension': 'ความดันตาสูง',
      'other': 'อื่นๆ'
    };
    
    const conditionName = conditionNames[historyData.condition];
    
    const additionalData = {
      category: 'family_history',
      relation: relation,
      condition: historyData.condition,
      diagnosis_age: diagnosisAge,
      is_risk_factor: true
    };
    
    await connection.query(
      `INSERT INTO PatientMedicalHistory (
        history_id,
        patient_id,
        condition_type,
        condition_name,
        current_status,
        notes,
        recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        historyId,
        patientId,
        'other',  
        `ประวัติครอบครัว: ${conditionName} (${relation})`,
        'active',
        JSON.stringify(additionalData),  
        patientId
      ]
    );
    
    await connection.commit();
    
    console.log('[Patient Service] Family history added successfully');
    return { history_id: historyId };
    
  } catch (error) {
    await connection.rollback();
    console.error('[Patient Service] Add family history error:', error.message);
    throw error;
    
  } finally {
    connection.release();
  }
}

/**
 * ดูประวัติครอบครัวเกี่ยวกับโรคต้อหิน
 */
async function getFamilyHistory(patientId) {
  try {
    console.log('[Patient Service] Getting family history for patient:', patientId);
    
    // ✅ Query โดยใช้ condition_type = 'other' และตรวจสอบ category ใน notes
    const [records] = await db.query(
      `SELECT 
        history_id,
        condition_name,
        notes,
        recorded_at,
        current_status
      FROM PatientMedicalHistory
      WHERE patient_id = ? 
        AND condition_type = 'other'
        AND (
          condition_name LIKE '%ประวัติครอบครัว%'
          OR notes LIKE '%family_history%'
        )
      ORDER BY recorded_at DESC`,
      [patientId]
    );
    
    const formattedRecords = records.map(record => {
      let parsedData = {};
      
      try {
        parsedData = JSON.parse(record.notes);
      } catch (e) {
        parsedData = { notes: record.notes };
      }
      
      return {
        history_id: record.history_id,
        relation: parsedData.relation || null,
        condition: parsedData.condition || null,
        diagnosis_age: parsedData.diagnosis_age || null,
        notes: parsedData.notes || record.notes,
        recorded_date: record.recorded_at ? 
          new Date(record.recorded_at).toISOString().split('T')[0] : null
      };
    });
    
    const hasFamilyHistory = records.length > 0 && 
      !records[0].condition_name.includes('No family history');
    
    console.log('[Patient Service] Family history retrieved successfully');
    
    return {
      has_family_history: hasFamilyHistory,
      records: formattedRecords
    };
    
  } catch (error) {
    console.error('[Patient Service] Get family history error:', error.message);
    throw error;
  }
}

// ============================================
// Eye Trauma History Functions
// ============================================

/**
 * บันทึกประวัติอุบัติเหตุทางตา
 */
async function addEyeTraumaHistory(patientId, traumaData) {
  const connection = await db.getConnection();
  
  try {
    console.log('[Patient Service] Adding eye trauma history for patient:', patientId);
    
    await connection.beginTransaction();
    
    // Validation (เหมือนเดิม...)
    if (!traumaData.incident_date) {
      throw new Error('กรุณาระบุวันที่เกิดเหตุ');
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(traumaData.incident_date)) {
      throw new Error('รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)');
    }
    
    const incidentDate = new Date(traumaData.incident_date);
    const today = new Date();
    
    if (isNaN(incidentDate.getTime())) {
      throw new Error('วันที่ไม่ถูกต้อง');
    }
    
    if (incidentDate > today) {
      throw new Error('วันที่เกิดเหตุต้องไม่เป็นวันในอนาคต');
    }
    
    const allowedEyes = ['left', 'right', 'both'];
    
    if (!traumaData.affected_eye) {
      throw new Error('กรุณาระบุตาที่ได้รับผลกระทบ');
    }
    
    if (!allowedEyes.includes(traumaData.affected_eye)) {
      throw new Error(`ตาที่ได้รับผลกระทบต้องเป็นหนึ่งใน: ${allowedEyes.join(', ')}`);
    }
    
    const allowedTraumaTypes = [
      'blunt_trauma',
      'penetrating_injury',
      'chemical_burn',
      'foreign_body',
      'other'
    ];
    
    if (!traumaData.trauma_type) {
      throw new Error('กรุณาระบุประเภทอุบัติเหตุ');
    }
    
    if (!allowedTraumaTypes.includes(traumaData.trauma_type)) {
      throw new Error(`ประเภทอุบัติเหตุต้องเป็นหนึ่งใน: ${allowedTraumaTypes.join(', ')}`);
    }
    
    const allowedSeverities = ['mild', 'moderate', 'severe'];
    
    if (!traumaData.severity) {
      throw new Error('กรุณาระบุความรุนแรง');
    }
    
    if (!allowedSeverities.includes(traumaData.severity)) {
      throw new Error(`ความรุนแรงต้องเป็นหนึ่งใน: ${allowedSeverities.join(', ')}`);
    }
    
    const treatmentReceived = traumaData.treatment_received ? 
      traumaData.treatment_received.trim() : null;
    const hospital = traumaData.hospital ? 
      traumaData.hospital.trim() : null;
    const complications = traumaData.complications ? 
      traumaData.complications.trim() : null;
    const notes = traumaData.notes ? 
      traumaData.notes.trim() : null;
    
    const historyId = `HIST${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    const traumaTypeNames = {
      'blunt_trauma': 'กระแทก',
      'penetrating_injury': 'บาดทะลุ',
      'chemical_burn': 'สารเคมีกัดกร่อน',
      'foreign_body': 'วัตถุแปลกปลอมเข้าตา',
      'other': 'อื่นๆ'
    };
    
    const eyeNames = {
      'left': 'ตาซ้าย',
      'right': 'ตาขวา',
      'both': 'ทั้งสองข้าง'
    };
    
    // ✅ เก็บข้อมูลใน notes เป็น JSON
    const additionalData = {
      category: 'eye_trauma',  // ✅ เพิ่ม category
      incident_date: traumaData.incident_date,
      affected_eye: traumaData.affected_eye,
      trauma_type: traumaData.trauma_type,
      severity: traumaData.severity,
      treatment_received: treatmentReceived,
      hospital: hospital,
      complications: complications,
      is_high_risk: traumaData.severity === 'severe',
      notes: notes
    };
    
    await connection.query(
      `INSERT INTO PatientMedicalHistory (
        history_id,
        patient_id,
        condition_type,
        condition_name,
        diagnosis_date,
        current_status,
        notes,
        recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        historyId,
        patientId,
        'injury',  // ✅ เปลี่ยนจาก 'eye_trauma' เป็น 'injury'
        `อุบัติเหตุทางตา - ${traumaTypeNames[traumaData.trauma_type]} (${eyeNames[traumaData.affected_eye]})`,
        traumaData.incident_date,
        'resolved',
        JSON.stringify(additionalData),  // ✅ เก็บเป็น JSON
        patientId
      ]
    );
    
    await connection.commit();
    
    console.log('[Patient Service] Eye trauma history added successfully');
    return { history_id: historyId };
    
  } catch (error) {
    await connection.rollback();
    console.error('[Patient Service] Add eye trauma history error:', error.message);
    throw error;
    
  } finally {
    connection.release();
  }
}

/**
 * ดูประวัติอุบัติเหตุทางตา
 */
async function getEyeTraumaHistory(patientId) {
  try {
    console.log('[Patient Service] Getting eye trauma history for patient:', patientId);
    
    // ✅ Query โดยใช้ condition_type = 'injury' และตรวจสอบ category ใน notes
    const [records] = await db.query(
      `SELECT 
        history_id,
        condition_name,
        diagnosis_date,
        notes,
        recorded_at
      FROM PatientMedicalHistory
      WHERE patient_id = ? 
        AND condition_type = 'injury'
        AND (
          condition_name LIKE '%อุบัติเหตุทางตา%'
          OR notes LIKE '%eye_trauma%'
        )
      ORDER BY diagnosis_date DESC, recorded_at DESC`,
      [patientId]
    );
    
    const formattedRecords = records.map(record => {
      let parsedData = {};
      
      try {
        parsedData = JSON.parse(record.notes);
      } catch (e) {
        parsedData = { notes: record.notes };
      }
      
      return {
        history_id: record.history_id,
        incident_date: record.diagnosis_date ? 
          new Date(record.diagnosis_date).toISOString().split('T')[0] : null,
        affected_eye: parsedData.affected_eye || null,
        trauma_type: parsedData.trauma_type || null,
        severity: parsedData.severity || null,
        treatment_received: parsedData.treatment_received || null,
        hospital: parsedData.hospital || null,
        complications: parsedData.complications || null,
        notes: parsedData.notes || record.notes,
        recorded_date: record.recorded_at ? 
          new Date(record.recorded_at).toISOString().split('T')[0] : null
      };
    });
    
    console.log('[Patient Service] Eye trauma history retrieved successfully');
    return formattedRecords;
    
  } catch (error) {
    console.error('[Patient Service] Get eye trauma history error:', error.message);
    throw error;
  }
}

module.exports = {
  getAppointments,
  verifyAppointmentOwnership,
  checkPendingRequest,
  createAppointmentRequest,
  getAppointmentRequests,
  getProfile,
  updateProfile,
  addFamilyHistory,
  getFamilyHistory,
  addEyeTraumaHistory,
  getEyeTraumaHistory
};