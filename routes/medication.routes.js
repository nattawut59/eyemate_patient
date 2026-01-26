// routes/medication.routes.js
const express = require('express');
const router = express.Router();
const medicationController = require('../controllers/medication.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

/**
 * Routes สำหรับ Medication Management
 * Base URL: /api/patients/medications
 * 
 * Authentication: ทุก route ต้อง login (verifyToken)
 * Authorization: เฉพาะ role 'patient' เท่านั้น
 */

/**
 * @route   GET /api/patients/medications/compliance
 * @desc    ดึงข้อมูล Medication Compliance Dashboard
 * @access  Private (Patient only)
 * @query   date (optional) - วันที่ต้องการดู (YYYY-MM-DD)
 * 
 * @example GET /api/patients/medications/compliance?date=2025-12-17
 */
router.get('/compliance',
  verifyToken,
  verifyRole(['patient']),
  medicationController.getComplianceDashboard
);

/**
 * @route   GET /api/patients/medications/compliance/history
 * @desc    ดึงประวัติ Compliance ย้อนหลัง
 * @access  Private (Patient only)
 * @query   days (optional) - จำนวนวันย้อนหลัง (default: 7, max: 90)
 * 
 * @example GET /api/patients/medications/compliance/history?days=30
 */
router.get('/compliance/history',
  verifyToken,
  verifyRole(['patient']),
  medicationController.getComplianceHistory
);

/**
 * @route   GET /api/patients/medications
 * @desc    ดูรายการยาทั้งหมดของผู้ป่วย
 * @access  Private (Patient only)
 * 
 * @example GET /api/patients/medications
 */
router.get('/',
  verifyToken,
  verifyRole(['patient']),
  medicationController.getPatientMedications
);

/**
 * @route   GET /api/patients/medications/:prescriptionId
 * @desc    ดูรายละเอียดยาตัวเดียว
 * @access  Private (Patient only)
 * 
 * @example GET /api/patients/medications/RX003001
 */
router.get('/:prescriptionId',
  verifyToken,
  verifyRole(['patient']),
  medicationController.getMedicationDetail
);

module.exports = router;