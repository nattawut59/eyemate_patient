// controllers/medicalDocument.controller.js
const medicalDocumentService = require('../services/medicalDocument.service');

/**
 * Medical Document Controller
 * จัดการ requests เกี่ยวกับไฟล์เอกสารทางการแพทย์
 */

/**
 * ดูรายการไฟล์เอกสารทางการแพทย์ทั้งหมด
 * GET /api/patients/medical-files
 */
async function getMedicalDocuments(req, res) {
  try {
    const patientId = req.user.userId; // จาก JWT token
    
    // Query parameters สำหรับ filter
    const filters = {
      documentType: req.query.document_type, // filter ตามประเภทเอกสาร
      startDate: req.query.start_date,       // filter ตามช่วงวันที่
      endDate: req.query.end_date,
      visitId: req.query.visit_id,           // filter ตาม visit
      limit: parseInt(req.query.limit) || 50, // จำกัดจำนวนผลลัพธ์
      offset: parseInt(req.query.offset) || 0 // pagination
    };
    
    // เรียก service
    const documents = await medicalDocumentService.getMedicalDocuments(
      patientId,
      filters
    );
    
    return res.json({
      success: true,
      data: documents,
      message: 'ดึงข้อมูลไฟล์เอกสารสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in getMedicalDocuments:', {
      message: error.message,
      userId: req.user?.userId
    });
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลไฟล์เอกสาร'
    });
  }
}

/**
 * ดูรายละเอียดไฟล์เอกสารทางการแพทย์ตาม ID
 * GET /api/patients/medical-files/:documentId
 */
async function getMedicalDocumentById(req, res) {
  try {
    const patientId = req.user.userId;
    const { documentId } = req.params;
    
    // Validate documentId
    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ document ID'
      });
    }
    
    // เรียก service
    const document = await medicalDocumentService.getMedicalDocumentById(
      patientId,
      documentId
    );
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบไฟล์เอกสารที่ระบุ'
      });
    }
    
    return res.json({
      success: true,
      data: document,
      message: 'ดึงข้อมูลไฟล์เอกสารสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in getMedicalDocumentById:', {
      message: error.message,
      documentId: req.params.documentId,
      userId: req.user?.userId
    });
    
    // ตรวจสอบ error แบบเจาะจง
    if (error.message === 'ไม่มีสิทธิ์เข้าถึงไฟล์นี้') {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลไฟล์เอกสาร'
    });
  }
}

/**
 * ดาวน์โหลดไฟล์เอกสารทางการแพทย์
 * GET /api/patients/medical-files/:documentId/download
 */
async function downloadMedicalDocument(req, res) {
  try {
    const patientId = req.user.userId;
    const { documentId } = req.params;
    
    // Validate documentId
    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ document ID'
      });
    }
    
    // ตรวจสอบสิทธิ์และดึงข้อมูลไฟล์
    const fileInfo = await medicalDocumentService.getFileInfoForDownload(
      patientId,
      documentId
    );
    
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบไฟล์เอกสารที่ระบุ'
      });
    }
    
    // ตรวจสอบว่าไฟล์มีอยู่จริง
    const fs = require('fs');
    const path = require('path');
    
    // สร้าง absolute path
    const filePath = path.join(process.cwd(), fileInfo.file_url);
    
    if (!fs.existsSync(filePath)) {
      console.error('File not found on disk:', filePath);
      return res.status(404).json({
        success: false,
        error: 'ไฟล์ไม่พบในระบบ'
      });
    }
    
    // ตั้งค่า headers สำหรับการดาวน์โหลด
    const fileName = path.basename(fileInfo.file_url);
    const contentType = getContentType(fileInfo.file_format);
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileInfo.file_size);
    
    // สร้าง read stream และส่งไฟล์
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      console.error('Error reading file:', {
        message: error.message,
        filePath: filePath
      });
      
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error: 'เกิดข้อผิดพลาดในการอ่านไฟล์'
        });
      }
    });
    
    // ส่งไฟล์
    fileStream.pipe(res);
    
    // บันทึก log การดาวน์โหลด
    await medicalDocumentService.logDownload(patientId, documentId);
    
  } catch (error) {
    console.error('Error in downloadMedicalDocument:', {
      message: error.message,
      documentId: req.params.documentId,
      userId: req.user?.userId
    });
    
    // ตรวจสอบ error แบบเจาะจง
    if (error.message === 'ไม่มีสิทธิ์เข้าถึงไฟล์นี้') {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }
    
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์'
      });
    }
  }
}

/**
 * Helper function: กำหนด Content-Type ตาม file format
 */
function getContentType(fileFormat) {
  const contentTypes = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain',
    'csv': 'text/csv'
  };
  
  return contentTypes[fileFormat?.toLowerCase()] || 'application/octet-stream';
}

module.exports = {
  getMedicalDocuments,
  getMedicalDocumentById,
  downloadMedicalDocument
};