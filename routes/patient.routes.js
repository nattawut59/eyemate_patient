// อัพเดทไฟล์ routes/patient.routes.js

const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { validateAppointmentQuery,validateAppointmentRequest } = require('../middleware/validation.middleware');
const patientController = require('../controllers/patient.controller');

/**
 * @route   GET /api/patients/appointments
 * @desc    ดูรายการนัดหมายของผู้ป่วย
 * @access  Private (Patient only)
 */
router.get('/appointments',
  verifyToken,
  verifyRole(['patient']),
  validateAppointmentQuery,
  patientController.getAppointments
);

/**
 * @route   POST /api/patients/appointment-requests
 * @desc    ขอเลื่อนนัดหมาย
 * @access  Private (Patient only)
 */
router.post('/appointment-requests',
  verifyToken,
  verifyRole(['patient']),
  validateAppointmentRequest,
  patientController.requestAppointmentChange
);

/**
 * @route   GET /api/patients/appointment-requests
 * @desc    ดูรายการคำขอเลื่อนนัดทั้งหมด
 * @access  Private (Patient only)
 */
router.get('/appointment-requests',
  verifyToken,
  verifyRole(['patient']),
  patientController.getAppointmentRequests
);

/**
 * GET /api/patients/profile
 * ดูโปรไฟล์ผู้ป่วย
 * Authentication: JWT token
 * Authorization: Patient only
 */
router.get('/profile',
  verifyToken,
  verifyRole(['patient']),
  patientController.getProfile
);

/**
 * PUT /api/patients/profile
 * แก้ไขโปรไฟล์ผู้ป่วย
 * Authentication: JWT token
 * Authorization: Patient only
 */
router.put('/profile',
  verifyToken,
  verifyRole(['patient']),
  patientController.updateProfile
);

// ✅ Family History endpoints (เพิ่มใหม่)
router.post('/family-history',
  verifyToken,
  verifyRole(['patient', 'admin']),
  patientController.addFamilyHistory
);

router.get('/family-history',
  verifyToken,
  verifyRole(['patient']),
  patientController.getFamilyHistory
);

// ✅ Eye Trauma History endpoints (เพิ่มใหม่)
router.post('/eye-trauma-history',
  verifyToken,
  verifyRole(['patient', 'admin']),
  patientController.addEyeTraumaHistory
);

router.get('/eye-trauma-history',
  verifyToken,
  verifyRole(['patient']),
  patientController.getEyeTraumaHistory
);

module.exports = router;
