// controllers/iop.controller.js
const iopService = require('../services/iop.service');

/**
 * Controller สำหรับจัดการ IOP Measurements
 */
class IOPController {
  
  /**
   * ดึงประวัติการวัดความดันตา
   * GET /api/patients/iop-readings?days=30
   */
  async getIOPReadings(req, res) {
    try {
      const patientId = req.user.userId;
      
      // ดึงจำนวนวันจาก query parameter (default = 30)
      const days = parseInt(req.query.days) || 30;
      
      // Validate days
      if (days < 1 || days > 365) {
        return res.status(400).json({
          success: false,
          error: 'จำนวนวันต้องอยู่ระหว่าง 1-365 วัน'
        });
      }
      
      console.log(`Getting IOP measurements for patient ${patientId}, ${days} days back`);
      
      // ดึงข้อมูลจาก service
      const result = await iopService.getIOPHistory(patientId, days);
      
      return res.json({
        success: true,
        data: result,
        message: `ดึงประวัติการวัดความดันตา ${days} วันย้อนหลังสำเร็จ`
      });
      
    } catch (error) {
      console.error('Error in getIOPReadings:', error.message);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลความดันตา'
      });
    }
  }
  
  /**
   * ดึงข้อมูลสำหรับกราฟความดันตา
   * GET /api/patients/iop-readings/chart?days=30
   */
  async getIOPChartData(req, res) {
    try {
      const patientId = req.user.userId;
      
      // ดึงจำนวนวันจาก query parameter (default = 30)
      const days = parseInt(req.query.days) || 30;
      
      // Validate days
      if (days < 1 || days > 365) {
        return res.status(400).json({
          success: false,
          error: 'จำนวนวันต้องอยู่ระหว่าง 1-365 วัน'
        });
      }
      
      console.log(`Getting IOP chart data for patient ${patientId}, ${days} days back`);
      
      // ดึงข้อมูลจาก service
      const result = await iopService.getIOPChartData(patientId, days);
      
      return res.json({
        success: true,
        data: result,
        message: `ดึงข้อมูลกราฟความดันตาสำเร็จ`
      });
      
    } catch (error) {
      console.error('Error in getIOPChartData:', error.message);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลกราฟ'
      });
    }
  }
}

module.exports = new IOPController();