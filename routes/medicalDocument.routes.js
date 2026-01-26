// routes/medicalDocument.routes.js
const express = require('express');
const router = express.Router();
const medicalDocumentController = require('../controllers/medicalDocument.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

/**
 * Medical Documents Routes
 * เส้นทาง API สำหรับจัดการไฟล์เอกสารทางการแพทย์
 */

// ✅ ดูรายการไฟล์เอกสารทางการแพทย์ทั้งหมดของผู้ป่วย
router.get('/',
  verifyToken,
  verifyRole(['patient']),
  medicalDocumentController.getMedicalDocuments
);

// ✅ ดูรายละเอียดไฟล์เอกสารทางการแพทย์ตาม ID
router.get('/:documentId',
  verifyToken,
  verifyRole(['patient']),
  medicalDocumentController.getMedicalDocumentById
);

// ✅ ดาวน์โหลดไฟล์เอกสารทางการแพทย์
router.get('/:documentId/download',
  verifyToken,
  verifyRole(['patient']),
  medicalDocumentController.downloadMedicalDocument
);

module.exports = router;