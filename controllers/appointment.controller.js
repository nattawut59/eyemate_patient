const appointmentService = require('../services/appointment.service');

/**
 * ดึงรายการนัดหมายของผู้ป่วย
 * GET /api/appointments
 */
async function getAppointments(req, res) {
  try {
    const patientId = req.user.userId;
    const {
      status,
      from_date,
      to_date,
      limit = 20,
      offset = 0
    } = req.query;
    
    const options = {
      status: status || null,
      fromDate: from_date || null,
      toDate: to_date || null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    const result = await appointmentService.getPatientAppointments(patientId, options);
    
    return res.json({
      success: true,
      data: result.appointments,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total
      }
    });
    
  } catch (error) {
    console.error('Error in getAppointments:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงรายการนัดหมาย'
    });
  }
}

/**
 * ดึงรายละเอียดนัดหมาย
 * GET /api/appointments/:appointmentId
 */
async function getAppointmentDetail(req, res) {
  try {
    const patientId = req.user.userId;
    const { appointmentId } = req.params;
    
    const appointment = await appointmentService.getAppointmentDetail(appointmentId, patientId);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบนัดหมายนี้'
      });
    }
    
    return res.json({
      success: true,
      data: appointment
    });
    
  } catch (error) {
    console.error('Error in getAppointmentDetail:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงรายละเอียดนัดหมาย'
    });
  }
}

/**
 * สร้างนัดหมายใหม่ (สำหรับ admin/doctor)
 * POST /api/appointments
 */
async function createAppointment(req, res) {
  try {
    const createdBy = req.user.userId;
    const {
      patient_id,
      doctor_id,
      appointment_date,
      appointment_time,
      appointment_type,
      appointment_location,
      appointment_duration,
      notes
    } = req.body;
    
    // Validation
    if (!patient_id || !doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุข้อมูลที่จำเป็น (patient_id, doctor_id, appointment_date, appointment_time)'
      });
    }
    
    const appointmentId = await appointmentService.createAppointment({
      patient_id,
      doctor_id,
      appointment_date,
      appointment_time,
      appointment_type,
      appointment_location,
      appointment_duration,
      notes
    }, createdBy);
    
    return res.status(201).json({
      success: true,
      message: 'สร้างนัดหมายสำเร็จ',
      data: {
        appointment_id: appointmentId
      }
    });
    
  } catch (error) {
    console.error('Error in createAppointment:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการสร้างนัดหมาย'
    });
  }
}

/**
 * ยกเลิกนัดหมาย
 * PUT /api/appointments/:appointmentId/cancel
 */
async function cancelAppointment(req, res) {
  try {
    const patientId = req.user.userId;
    const { appointmentId } = req.params;
    const { cancellation_reason } = req.body;
    
    const success = await appointmentService.updateAppointmentStatus(
      appointmentId,
      patientId,
      'cancelled',
      cancellation_reason || 'ผู้ป่วยขอยกเลิก'
    );
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบนัดหมายนี้'
      });
    }
    
    return res.json({
      success: true,
      message: 'ยกเลิกนัดหมายสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in cancelAppointment:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการยกเลิกนัดหมาย'
    });
  }
}

module.exports = {
  getAppointments,
  getAppointmentDetail,
  createAppointment,
  cancelAppointment
};