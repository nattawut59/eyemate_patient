const db = require('../config/database.config');
const notificationService = require('./notification.service');

/**
 * ดึงรายการนัดหมายของผู้ป่วย
 */
async function getPatientAppointments(patientId, options = {}) {
  try {
    const {
      status = null,
      fromDate = null,
      toDate = null,
      limit = 20,
      offset = 0
    } = options;
    
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
        d.first_name as doctor_first_name,
        d.last_name as doctor_last_name,
        d.specialty as doctor_specialty
      FROM Appointments a
      LEFT JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
      WHERE a.patient_id = ?
    `;
    
    const params = [patientId];
    
    if (status) {
      query += ` AND a.appointment_status = ?`;
      params.push(status);
    }
    
    if (fromDate) {
      query += ` AND a.appointment_date >= ?`;
      params.push(fromDate);
    }
    
    if (toDate) {
      query += ` AND a.appointment_date <= ?`;
      params.push(toDate);
    }
    
    query += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const [appointments] = await db.query(query, params);
    
    // นับจำนวนทั้งหมด
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM Appointments 
      WHERE patient_id = ?
    `;
    const countParams = [patientId];
    
    if (status) {
      countQuery += ` AND appointment_status = ?`;
      countParams.push(status);
    }
    
    if (fromDate) {
      countQuery += ` AND appointment_date >= ?`;
      countParams.push(fromDate);
    }
    
    if (toDate) {
      countQuery += ` AND appointment_date <= ?`;
      countParams.push(toDate);
    }
    
    const [countResult] = await db.query(countQuery, countParams);
    
    return {
      appointments,
      total: countResult[0].total,
      limit,
      offset
    };
    
  } catch (error) {
    console.error('Error getting patient appointments:', error);
    throw error;
  }
}

/**
 * ดึงรายละเอียดนัดหมาย
 */
async function getAppointmentDetail(appointmentId, patientId) {
  try {
    const [appointments] = await db.query(
      `SELECT 
        a.appointment_id,
        a.appointment_date,
        a.appointment_time,
        a.appointment_type,
        a.appointment_location,
        a.appointment_duration,
        a.appointment_status,
        a.cancellation_reason,
        a.notes,
        a.created_at,
        d.first_name as doctor_first_name,
        d.last_name as doctor_last_name,
        d.specialty as doctor_specialty,
        d.hospital_affiliation
      FROM Appointments a
      LEFT JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
      WHERE a.appointment_id = ? AND a.patient_id = ?`,
      [appointmentId, patientId]
    );
    
    if (appointments.length === 0) {
      return null;
    }
    
    return appointments[0];
    
  } catch (error) {
    console.error('Error getting appointment detail:', error);
    throw error;
  }
}

/**
 * สร้างนัดหมายใหม่ (โดย admin/doctor)
 * และส่ง notification ให้ผู้ป่วย
 */
async function createAppointment(appointmentData, createdBy) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 1. สร้าง appointment ID
    const appointmentId = 'APPT' + Date.now();
    
    // 2. Insert appointment
    await connection.query(
      `INSERT INTO Appointments (
        appointment_id,
        patient_id,
        doctor_id,
        appointment_date,
        appointment_time,
        appointment_type,
        appointment_location,
        appointment_duration,
        appointment_status,
        notes,
        created_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, NOW())`,
      [
        appointmentId,
        appointmentData.patient_id,
        appointmentData.doctor_id,
        appointmentData.appointment_date,
        appointmentData.appointment_time,
        appointmentData.appointment_type || null,
        appointmentData.appointment_location || null,
        appointmentData.appointment_duration || 30,
        appointmentData.notes || null,
        createdBy
      ]
    );
    
    // 3. Commit transaction
    await connection.commit();
    
    // 4. ส่ง notification (ไม่ใช่ transaction เพราะถ้า fail ไม่ควร rollback appointment)
    try {
      // ดึงข้อมูล doctor
      const [doctors] = await connection.query(
        `SELECT first_name, last_name FROM DoctorProfiles WHERE doctor_id = ?`,
        [appointmentData.doctor_id]
      );
      
      const doctorName = doctors.length > 0 
        ? `${doctors[0].first_name} ${doctors[0].last_name}`
        : 'แพทย์';
      
      // สร้างและส่ง notification
      await notificationService.createAndSendNotification({
        userId: appointmentData.patient_id,
        notificationType: 'appointment_created',
        title: 'นัดหมายใหม่',
        body: `คุณมีนัดพบ${doctorName} วันที่ ${appointmentData.appointment_date} เวลา ${appointmentData.appointment_time}`,
        relatedEntityType: 'appointment',
        relatedEntityId: appointmentId,
        priority: 'medium',
        data: {
          appointment_id: appointmentId,
          appointment_date: appointmentData.appointment_date,
          appointment_time: appointmentData.appointment_time
        }
      });
    } catch (notifError) {
      console.error('Error sending appointment notification:', notifError);
      // ไม่ throw error เพราะ appointment สร้างสำเร็จแล้ว
    }
    
    return appointmentId;
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creating appointment:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * อัปเดตสถานะนัดหมาย
 */
async function updateAppointmentStatus(appointmentId, patientId, newStatus, cancellationReason = null) {
  try {
    const [result] = await db.query(
      `UPDATE Appointments 
       SET appointment_status = ?,
           cancellation_reason = ?,
           updated_at = NOW()
       WHERE appointment_id = ? AND patient_id = ?`,
      [newStatus, cancellationReason, appointmentId, patientId]
    );
    
    if (result.affectedRows === 0) {
      return false;
    }
    
    // ส่ง notification ถ้ายกเลิก
    if (newStatus === 'cancelled') {
      try {
        await notificationService.createAndSendNotification({
          userId: patientId,
          notificationType: 'appointment_cancelled',
          title: 'นัดหมายถูกยกเลิก',
          body: cancellationReason || 'นัดหมายของคุณถูกยกเลิก',
          relatedEntityType: 'appointment',
          relatedEntityId: appointmentId,
          priority: 'high',
          data: {
            appointment_id: appointmentId,
            status: 'cancelled'
          }
        });
      } catch (notifError) {
        console.error('Error sending cancellation notification:', notifError);
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('Error updating appointment status:', error);
    throw error;
  }
}

/**
 * ส่ง notification เตือนนัดหมาย (สำหรับ cron job)
 */
async function sendAppointmentReminders() {
  try {
    // หานัดหมายที่จะมาในอีก 1 วัน
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const [appointments] = await db.query(
      `SELECT 
        a.appointment_id,
        a.patient_id,
        a.appointment_date,
        a.appointment_time,
        a.appointment_type,
        a.appointment_location,
        d.first_name as doctor_first_name,
        d.last_name as doctor_last_name
      FROM Appointments a
      LEFT JOIN DoctorProfiles d ON a.doctor_id = d.doctor_id
      WHERE a.appointment_date = ?
        AND a.appointment_status = 'scheduled'`,
      [tomorrowStr]
    );
    
    console.log(`Found ${appointments.length} appointments for tomorrow`);
    
    // ส่ง notification ทีละนัด
    for (const appt of appointments) {
      try {
        const doctorName = `${appt.doctor_first_name} ${appt.doctor_last_name}`;
        
        await notificationService.createAndSendNotification({
          userId: appt.patient_id,
          notificationType: 'appointment_reminder',
          title: 'แจ้งเตือนนัดหมาย',
          body: `พรุ่งนี้คุณมีนัดพบ${doctorName} เวลา ${appt.appointment_time} ที่ ${appt.appointment_location || 'คลินิก'}`,
          relatedEntityType: 'appointment',
          relatedEntityId: appt.appointment_id,
          priority: 'high',
          data: {
            appointment_id: appt.appointment_id,
            appointment_date: appt.appointment_date,
            appointment_time: appt.appointment_time,
            reminder_type: '1_day'
          }
        });
        
        console.log(`Sent reminder for appointment ${appt.appointment_id}`);
        
      } catch (error) {
        console.error(`Error sending reminder for appointment ${appt.appointment_id}:`, error);
      }
    }
    
    return { success: true, count: appointments.length };
    
  } catch (error) {
    console.error('Error in sendAppointmentReminders:', error);
    throw error;
  }
}

module.exports = {
  getPatientAppointments,
  getAppointmentDetail,
  createAppointment,
  updateAppointmentStatus,
  sendAppointmentReminders
};