// controllers/medication.controller.js
const medicationService = require('../services/medication.service');

/**
 * Controller สำหรับจัดการ Medication API
 */
class MedicationController {
  
  /**
   * GET /api/patients/medication-compliance
   * ดึงข้อมูล Medication Compliance Dashboard
   */
  async getComplianceDashboard(req, res) {
    try {
      const patientId = req.user.userId; // จาก JWT token
      
      // รับ query parameter (ถ้าไม่มีใช้วันนี้)
      const date = req.query.date || new Date().toISOString().split('T')[0];
      
      console.log(`[Controller] Getting compliance for patient: ${patientId}, date: ${date}`);
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return res.status(400).json({
          success: false,
          error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)'
        });
      }
      
      // ดึงข้อมูล compliance
      const complianceData = await medicationService.getMedicationCompliance(patientId, date);
      
      return res.json({
        success: true,
        data: complianceData
      });
      
    } catch (error) {
      console.error('[Controller] Error in getComplianceDashboard:', error.message);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
      });
    }
  }
  
  /**
   * GET /api/patients/medication-compliance/history
   * ดึงประวัติ Compliance ย้อนหลัง
   */
  async getComplianceHistory(req, res) {
    try {
      const patientId = req.user.userId;
      const days = parseInt(req.query.days) || 7; // default 7 วัน
      
      // Validate days
      if (days < 1 || days > 90) {
        return res.status(400).json({
          success: false,
          error: 'จำนวนวันต้องอยู่ระหว่าง 1-90 วัน'
        });
      }
      
      console.log(`[Controller] Getting ${days} days history for patient: ${patientId}`);
      
      const history = await medicationService.getComplianceHistory(patientId, days);
      
      return res.json({
        success: true,
        data: {
          period: `${days} วันที่ผ่านมา`,
          history
        }
      });
      
    } catch (error) {
      console.error('[Controller] Error in getComplianceHistory:', error.message);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงประวัติ'
      });
    }
  }
/**
   * GET /api/patients/medications
   * ดูรายการยาทั้งหมดของผู้ป่วย
   */
  async getPatientMedications(req, res) {
    try {
      const patientId = req.user.userId;
      
      console.log(`[Controller] Getting medications for patient: ${patientId}`);
      
      const medications = await medicationService.getPatientMedications(patientId);
      
      return res.json({
        success: true,
        data: medications
      });
      
    } catch (error) {
      console.error('[Controller] Error getting medications:', error.message);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลยา'
      });
    }
  }

  /**
   * GET /api/patients/medications/:prescriptionId
   * ดูรายละเอียดยาตัวเดียว
   */
  async getMedicationDetail(req, res) {
    try {
      const patientId = req.user.userId;
      const { prescriptionId } = req.params;
      
      console.log(`[Controller] Getting medication detail: ${prescriptionId}`);
      
      if (!prescriptionId) {
        return res.status(400).json({
          success: false,
          error: 'กรุณาระบุรหัสใบสั่งยา'
        });
      }
      
      const medication = await medicationService.getMedicationDetail(patientId, prescriptionId);
      
      return res.json({
        success: true,
        data: medication
      });
      
    } catch (error) {
      console.error('[Controller] Error getting medication detail:', error.message);
      
      if (error.message.includes('ไม่พบข้อมูลยา')) {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
      });
    }
  }
}

module.exports = new MedicationController();
