// routes/iop.routes.js
const express = require('express');
const router = express.Router();
const iopController = require('../controllers/iop.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

/**
 * Routes สำหรับ IOP Readings
 * Base path: /api/patients/iop-readings
 */

/**
 * @route   GET /api/patients/iop-readings
 * @desc    ดึงประวัติการวัดความดันตา
 * @access  Private (Patient only)
 * @query   days - จำนวนวันย้อนหลัง (default = 30)
 */
router.get('/',
  verifyToken,
  verifyRole(['patient']),
  iopController.getIOPReadings
);

/**
 * @route   GET /api/patients/iop-readings/chart
 * @desc    ดึงข้อมูลสำหรับกราฟความดันตา
 * @access  Private (Patient only)
 * @query   days - จำนวนวันย้อนหลัง (default = 30)
 */
router.get('/chart',
  verifyToken,
  verifyRole(['patient']),
  iopController.getIOPChartData
);

module.exports = router;