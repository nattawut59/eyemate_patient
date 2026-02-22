// services/appointment.service.js

const db = require('../config/database.config');
const notificationService = require('./notification.service');

// ============================================
// 1. ส่งแจ้งเตือนนัดหมายที่ใกล้เข้ามา
//    เรียกจาก cron ทุกวัน 09:00 น.
// ============================================

/**
 * ส่งแจ้งเตือนนัดหมายล่วงหน้า
 * - 3 วันก่อน  (reminder_type = '3_days')
 * - 1 วันก่อน  (reminder_type = '1_day')
 * - วันนัด ภายใน 3 ชั่วโมง
 *
 * ใช้ตาราง AppointmentReminders track ว่าส่งแล้วหรือยัง → ป้องกันส่งซ้ำ
 */
const sendAppointmentReminders = async () => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

    const oneDayLater = new Date(now);
    oneDayLater.setDate(oneDayLater.getDate() + 1);
    const oneDayLaterStr = oneDayLater.toISOString().split('T')[0];

    // ดึงนัดหมายในช่วง 3 วันข้างหน้า
    const [appointments] = await db.query(
      `SELECT
         a.appointment_id,
         a.patient_id,
         a.appointment_date,
         a.appointment_time,
         a.appointment_location  AS location,
         a.appointment_status    AS status,
         CONCAT(u.first_name, ' ', u.last_name) AS doctor_name
       FROM Appointments a
       JOIN DoctorProfiles dp ON a.doctor_id = dp.doctor_id
       JOIN users u ON dp.doctor_id = u.user_id
       WHERE a.appointment_status = 'scheduled'
         AND DATE(a.appointment_date) BETWEEN ? AND ?`,
      [todayStr, threeDaysLaterStr]
    );

    if (appointments.length === 0) return { count: 0 };

    let sentCount = 0;

    for (const appt of appointments) {
      try {
        const apptDateStr = new Date(appt.appointment_date).toISOString().split('T')[0];
        const timeLabel = appt.appointment_time?.substring(0, 5) || '';
        const dateLabel = new Date(`${apptDateStr}T00:00:00`).toLocaleDateString('th-TH', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });

        let reminderType = null;
        let title = '';
        let body = '';

        if (apptDateStr === threeDaysLaterStr) {
          reminderType = '3_days';
          title = '📅 เตือนนัดหมายล่วงหน้า';
          body = `อีก 3 วัน: ${dateLabel} เวลา ${timeLabel} น.\nแพทย์: ${appt.doctor_name}\nสถานที่: ${appt.location}`;

        } else if (apptDateStr === oneDayLaterStr) {
          reminderType = '1_day';
          title = '📅 พรุ่งนี้มีนัดหมาย';
          body = `พรุ่งนี้ ${dateLabel} เวลา ${timeLabel} น.\nแพทย์: ${appt.doctor_name}\nสถานที่: ${appt.location}`;

        } else if (apptDateStr === todayStr) {
          const [apptH, apptM] = (appt.appointment_time || '00:00').split(':').map(Number);
          const apptDateTime = new Date(`${apptDateStr}T00:00:00`);
          apptDateTime.setHours(apptH, apptM, 0, 0);
          const diffHours = (apptDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (diffHours < 0 || diffHours > 3) continue;

          reminderType = '1_day'; // ใช้ 1_day สำหรับ same-day reminder ด้วย
          title = '⏰ ใกล้ถึงเวลานัด';
          body = `วันนี้ เวลา ${timeLabel} น.\nแพทย์: ${appt.doctor_name}\nสถานที่: ${appt.location}`;

        } else {
          continue;
        }

        // เช็คว่าเคยส่ง reminder_type นี้ไปแล้วหรือยัง (ป้องกันซ้ำ)
        const [existing] = await db.query(
          `SELECT reminder_id FROM AppointmentReminders
           WHERE appointment_id = ? AND reminder_type = ? AND reminder_status = 'sent'`,
          [appt.appointment_id, reminderType]
        );
        if (existing.length > 0) {
          console.log(`⏭️ [Appointment] Already sent ${reminderType} for ${appt.appointment_id}`);
          continue;
        }

        // ส่ง push notification
        await notificationService.createAndSendNotification({
          userId: appt.patient_id,
          type: 'appointment',
          title,
          body,
          relatedType: 'appointment',
          relatedId: appt.appointment_id,
          priority: 'high',
          data: {
            appointment_id: appt.appointment_id,
            appointment_date: apptDateStr,
            appointment_time: appt.appointment_time,
          },
          sendPush: true,
        });

        // บันทึกลง AppointmentReminders ป้องกันส่งซ้ำ
        const reminderId = `REM${Date.now().toString().slice(-10)}${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
        await db.query(
          `INSERT INTO AppointmentReminders
             (reminder_id, appointment_id, patient_id, reminder_type,
              reminder_channels, reminder_status, sent_at)
           VALUES (?, ?, ?, ?, 'push', 'sent', NOW())`,
          [reminderId, appt.appointment_id, appt.patient_id, reminderType]
        );

        // อัปเดต flag ใน Appointments
        await db.query(
          `UPDATE Appointments SET appointment_reminder_sent_at = NOW() WHERE appointment_id = ?`,
          [appt.appointment_id]
        );

        sentCount++;
        console.log(`✅ [Appointment] ${reminderType} sent → patient ${appt.patient_id}`);

      } catch (err) {
        console.error(`❌ [Appointment] Failed for ${appt.appointment_id}:`, err.message);
      }
    }

    return { count: sentCount };

  } catch (error) {
    console.error('❌ [sendAppointmentReminders] Error:', error);
    throw error;
  }
};

// ============================================
// 2. แจ้งเตือนสถานะการขอเลื่อนนัด
// ============================================

/**
 * ส่งแจ้งเตือนเมื่อสถานะ reschedule request เปลี่ยน
 * ใช้ชื่อ table/column จริงใน DB:
 *   AppointmentChangeRequests, request_status, requested_new_date,
 *   requested_new_time, admin_notes, action_by_id, action_date
 */
const sendRescheduleStatusNotification = async (
  requestId,
  newStatus,
  updatedBy,
  adminNotes = null
) => {
  try {
    const [requests] = await db.query(
      `SELECT
         acr.request_id,
         acr.patient_id,
         acr.appointment_id,
         acr.requested_new_date,
         acr.requested_new_time,
         acr.admin_notes,
         a.appointment_date      AS original_date,
         a.appointment_time      AS original_time,
         a.appointment_location  AS location,
         CONCAT(u.first_name, ' ', u.last_name) AS doctor_name
       FROM AppointmentChangeRequests acr
       JOIN Appointments a ON acr.appointment_id = a.appointment_id
       JOIN DoctorProfiles dp ON a.doctor_id = dp.doctor_id
       JOIN users u ON dp.doctor_id = u.user_id
       WHERE acr.request_id = ?`,
      [requestId]
    );

    if (requests.length === 0) {
      console.warn(`⚠️ [Reschedule] Request not found: ${requestId}`);
      return;
    }

    const req = requests[0];

    // แปลง Date object เป็น string (MySQL อาจ return เป็น Date object)
    const newDateStr = req.requested_new_date instanceof Date
      ? req.requested_new_date.toISOString().split('T')[0]
      : String(req.requested_new_date);
    const origDateStr = req.original_date instanceof Date
      ? req.original_date.toISOString().split('T')[0]
      : String(req.original_date);

    const newDateLabel = new Date(`${newDateStr}T00:00:00`).toLocaleDateString('th-TH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const newTimeLabel = req.requested_new_time?.substring(0, 5) || '';
    const origDateLabel = new Date(`${origDateStr}T00:00:00`).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const origTimeLabel = req.original_time?.substring(0, 5) || '';

    // ใช้ adminNotes ที่ส่งมา ถ้าไม่มีใช้จาก DB
    const noteText = adminNotes || req.admin_notes;

    let title = '';
    let body = '';

    if (newStatus === 'approved') {
      title = '✅ อนุมัติการเลื่อนนัดแล้ว';
      body =
        `นัดหมายใหม่: ${newDateLabel}\n` +
        `เวลา: ${newTimeLabel} น.\n` +
        `แพทย์: ${req.doctor_name}\n` +
        `สถานที่: ${req.location}`;

    } else if (newStatus === 'rejected') {
      title = '❌ ไม่อนุมัติการเลื่อนนัด';
      body =
        `คำขอเลื่อนไปวันที่ ${newDateLabel} เวลา ${newTimeLabel} น. ไม่ได้รับการอนุมัติ\n` +
        `นัดหมายเดิม: ${origDateLabel} เวลา ${origTimeLabel} น. ยังคงเดิม` +
        (noteText ? `\nหมายเหตุ: ${noteText}` : '');

    } else {
      return; // สถานะอื่นไม่ส่ง
    }

    await notificationService.createAndSendNotification({
      userId: req.patient_id,
      type: 'appointment_reschedule',
      title,
      body,
      relatedType: 'appointment_change_request',
      relatedId: requestId,
      priority: 'high',
      data: {
        request_id: requestId,
        appointment_id: req.appointment_id,
        new_status: newStatus,
        requested_new_date: newDateStr,
        requested_new_time: req.requested_new_time,
      },
      sendPush: true,
    });

    console.log(`✅ [Reschedule] Notification sent: ${newStatus} → patient ${req.patient_id}`);

  } catch (error) {
    console.error('❌ [sendRescheduleStatusNotification] Error:', error);
    throw error;
  }
};

// ============================================
// 3. ดึงข้อมูลนัดหมาย
// ============================================

const getUpcomingAppointments = async (patientId, days = 30) => {
  try {
    const [appointments] = await db.query(
      `SELECT
         a.appointment_id,
         a.appointment_date,
         a.appointment_time,
         a.appointment_type,
         a.appointment_location  AS location,
         a.appointment_status    AS status,
         a.notes,
         CONCAT(u.first_name, ' ', u.last_name) AS doctor_name,
         dp.specialty
       FROM Appointments a
       JOIN DoctorProfiles dp ON a.doctor_id = dp.doctor_id
       JOIN users u ON dp.doctor_id = u.user_id
       WHERE a.patient_id = ?
         AND a.appointment_status = 'scheduled'
         AND DATE(a.appointment_date) >= CURDATE()
         AND DATE(a.appointment_date) <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY a.appointment_date ASC, a.appointment_time ASC`,
      [patientId, days]
    );
    return { success: true, data: appointments, total: appointments.length };
  } catch (error) {
    throw error;
  }
};

const getRescheduleRequests = async (patientId, status = null) => {
  try {
    let query = `
      SELECT
        acr.request_id,
        acr.appointment_id,
        acr.request_type,
        acr.requested_new_date,
        acr.requested_new_time,
        acr.reason,
        acr.request_status      AS status,
        acr.admin_notes,
        acr.action_date,
        acr.created_at,
        a.appointment_date      AS original_date,
        a.appointment_time      AS original_time,
        a.appointment_location  AS location,
        CONCAT(u.first_name, ' ', u.last_name) AS doctor_name
      FROM AppointmentChangeRequests acr
      JOIN Appointments a ON acr.appointment_id = a.appointment_id
      JOIN DoctorProfiles dp ON a.doctor_id = dp.doctor_id
      JOIN users u ON dp.doctor_id = u.user_id
      WHERE acr.patient_id = ?
    `;
    const params = [patientId];
    if (status) {
      query += ` AND acr.request_status = ?`;
      params.push(status);
    }
    query += ` ORDER BY acr.created_at DESC`;
    const [requests] = await db.query(query, params);
    return { success: true, data: requests, total: requests.length };
  } catch (error) {
    throw error;
  }
};

const createRescheduleRequest = async (patientId, requestData) => {
  try {
    const { appointment_id, requested_date, requested_time, reason } = requestData;

    const [appointments] = await db.query(
      `SELECT appointment_id FROM Appointments
       WHERE appointment_id = ? AND patient_id = ? AND appointment_status = 'scheduled'`,
      [appointment_id, patientId]
    );
    if (appointments.length === 0) throw new Error('ไม่พบนัดหมายหรือนัดหมายถูกยกเลิกแล้ว');

    const [pending] = await db.query(
      `SELECT request_id FROM AppointmentChangeRequests
       WHERE appointment_id = ? AND request_status = 'pending'`,
      [appointment_id]
    );
    if (pending.length > 0) throw new Error('มีคำขอเลื่อนนัดที่รอการอนุมัติอยู่แล้ว');

    const requestId = `REQ${Date.now().toString().slice(-10)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    await db.query(
      `INSERT INTO AppointmentChangeRequests
         (request_id, patient_id, appointment_id, request_type,
          requested_new_date, requested_new_time, reason, request_status, created_at)
       VALUES (?, ?, ?, 'reschedule', ?, ?, ?, 'pending', NOW())`,
      [requestId, patientId, appointment_id, requested_date, requested_time, reason]
    );

    return {
      success: true,
      request_id: requestId,
      message: 'ส่งคำขอเลื่อนนัดสำเร็จ รอการอนุมัติจากแพทย์',
    };
  } catch (error) {
    throw error;
  }
};

/**
 * อัปเดตสถานะ (doctor/admin) → ส่ง notification หาผู้ป่วยอัตโนมัติ
 */
const updateRescheduleRequestStatus = async (
  requestId,
  newStatus,
  updatedBy,
  adminNotes = null
) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [requests] = await connection.query(
      `SELECT * FROM AppointmentChangeRequests WHERE request_id = ?`,
      [requestId]
    );
    if (requests.length === 0) throw new Error('ไม่พบคำขอเลื่อนนัด');

    const req = requests[0];
    if (req.request_status !== 'pending') throw new Error('คำขอนี้ถูกดำเนินการแล้ว');

    // อัปเดตสถานะใน AppointmentChangeRequests
    await connection.query(
      `UPDATE AppointmentChangeRequests SET
         request_status = ?,
         admin_notes    = COALESCE(?, admin_notes),
         action_by_id   = ?,
         action_date    = NOW()
       WHERE request_id = ?`,
      [newStatus, adminNotes, updatedBy, requestId]
    );

    // ถ้า approved → อัปเดตวันเวลาของ Appointments ด้วย
    if (newStatus === 'approved') {
      await connection.query(
        `UPDATE Appointments SET
           appointment_date   = ?,
           appointment_time   = ?,
           appointment_status = 'rescheduled',
           updated_at         = NOW()
         WHERE appointment_id = ?`,
        [req.requested_new_date, req.requested_new_time, req.appointment_id]
      );
    }

    await connection.commit();

    // ส่ง notification แบบ non-blocking (ไม่กระทบ response)
    sendRescheduleStatusNotification(requestId, newStatus, updatedBy, adminNotes)
      .catch(err => console.error('❌ [Reschedule] Notification error:', err.message));

    return {
      success: true,
      request_id: requestId,
      new_status: newStatus,
      message: newStatus === 'approved' ? 'อนุมัติการเลื่อนนัดสำเร็จ' : 'ปฏิเสธการเลื่อนนัดสำเร็จ',
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  sendAppointmentReminders,
  sendRescheduleStatusNotification,
  getUpcomingAppointments,
  getRescheduleRequests,
  createRescheduleRequest,
  updateRescheduleRequestStatus,
};