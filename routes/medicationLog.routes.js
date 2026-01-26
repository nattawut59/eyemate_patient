// routes/medicationLog.routes.js
const express = require('express');
const router = express.Router();
const medicationLogController = require('../controllers/medicationLog.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

/**
 * Routes สำหรับบันทึกการหยอดยา
 * Base URL: /api/patients/medication-logs
 */

/**
 * GET /api/patients/medication-logs/reminders-today
 * ดูรายการยาที่ต้องหยอดวันนี้
 */
router.get('/reminders-today',
  verifyToken,
  verifyRole(['patient']),
  medicationLogController.getTodayReminders
);

/**
 * POST /api/patients/medication-logs
 * บันทึกการหยอดยา
 */
router.post('/',
  verifyToken,
  verifyRole(['patient']),
  medicationLogController.logMedication
);

module.exports = router;