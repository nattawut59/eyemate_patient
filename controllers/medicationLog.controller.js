// controllers/medicationLog.controller.js
const medicationLogService = require('../services/medicationLog.service');

/**
 * Controller สำหรับบันทึกการหยอดยา
 */
class MedicationLogController {
  
  /**
   * POST /api/patients/medication-logs
   * บันทึกการหยอดยา
   */
  async logMedication(req, res) {
    try {
      const patientId = req.user.userId;
      const { reminder_id, actual_time, notes } = req.body;
      
      console.log(`[LogController] Patient ${patientId} logging medication`);
      
      if (!reminder_id) {
        return res.status(400).json({
          success: false,
          error: 'กรุณาระบุ reminder_id'
        });
      }
      
      if (actual_time) {
        const date = new Date(actual_time);
        if (isNaN(date.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'รูปแบบเวลาไม่ถูกต้อง'
          });
        }
      }
      
      const logData = {
        reminder_id: reminder_id,
        actual_time: actual_time ? new Date(actual_time) : null,
        notes: notes
      };
      
      const result = await medicationLogService.logMedicationUsage(patientId, logData);
      
      return res.status(201).json({
        success: true,
        message: 'บันทึกการหยอดยาสำเร็จ',
        data: result
      });
      
    } catch (error) {
      console.error('[LogController] Error:', error.message);
      
      if (error.message.includes('ไม่พบตารางเวลา')) {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }
      
      if (error.message.includes('ถูกปิดใช้งาน') || 
          error.message.includes('ถูกหยุดใช้')) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'
      });
    }
  }
  
  /**
   * GET /api/patients/medication-logs/reminders-today
   * ดูรายการยาที่ต้องหยอดวันนี้
   */
  async getTodayReminders(req, res) {
    try {
      const patientId = req.user.userId;
      
      console.log(`[LogController] Getting today reminders for: ${patientId}`);
      
      const reminders = await medicationLogService.getTodayReminders(patientId);
      
      return res.json({
        success: true,
        data: {
          date: new Date().toISOString().split('T')[0],
          reminders: reminders
        }
      });
      
    } catch (error) {
      console.error('[LogController] Error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
      });
    }
  }
}

module.exports = new MedicationLogController();