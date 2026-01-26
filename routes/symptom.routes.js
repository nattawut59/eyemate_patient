const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const symptomController = require('../controllers/symptom.controller');
const { validateSymptomLog } = require('../middleware/validation.middleware');

/**
 * @route   POST /api/patients/symptoms
 * @desc    บันทึกอาการผิดปกติของผู้ป่วย
 * @access  Private - Patient only
 */
router.post('/',
  verifyToken,
  verifyRole(['patient']),
  validateSymptomLog,
  symptomController.createSymptomLog
);

/**
 * @route   GET /api/patients/symptoms
 * @desc    ดูประวัติอาการผิดปกติของตนเอง
 * @access  Private - Patient only
 */
router.get('/',
  verifyToken,
  verifyRole(['patient']),
  symptomController.getMySymptomLogs
);

/**
 * @route   GET /api/patients/symptoms/:symptom_id
 * @desc    ดูรายละเอียดอาการผิดปกติ 1 รายการ
 * @access  Private - Patient only
 */
router.get('/:symptom_id',
  verifyToken,
  verifyRole(['patient']),
  symptomController.getSymptomLogById
);

module.exports = router;