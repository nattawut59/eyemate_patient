const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointment.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

/**
 * GET /api/appointments
 * ดึงรายการนัดหมายของผู้ป่วย
 * Query params: status, from_date, to_date, limit, offset
 */
router.get('/',
  verifyToken,
  verifyRole(['patient']),
  appointmentController.getAppointments
);

/**
 * GET /api/appointments/:appointmentId
 * ดึงรายละเอียดนัดหมาย
 */
router.get('/:appointmentId',
  verifyToken,
  verifyRole(['patient']),
  appointmentController.getAppointmentDetail
);

/**
 * POST /api/appointments
 * สร้างนัดหมายใหม่ (สำหรับ admin/doctor)
 */
router.post('/',
  verifyToken,
  verifyRole(['admin', 'doctor']),
  appointmentController.createAppointment
);

/**
 * PUT /api/appointments/:appointmentId/cancel
 * ยกเลิกนัดหมาย
 */
router.put('/:appointmentId/cancel',
  verifyToken,
  verifyRole(['patient']),
  appointmentController.cancelAppointment
);

module.exports = router;