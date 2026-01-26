// services/iop.service.js
const db = require('../config/database.config');

/**
 * Service สำหรับจัดการข้อมูล IOP (ความดันตา)
 */
class IOPService {
  
  /**
   * ดึงข้อมูล Target IOP ของผู้ป่วยจาก Treatment Plan
   * @param {string} patientId - รหัสผู้ป่วย
   * @returns {object} ค่า target IOP ของตาซ้าย-ขวา
   */
  async getTargetIOP(patientId) {
    try {
      const [plans] = await db.query(
        `SELECT 
          target_iop_left,
          target_iop_right,
          updated_at
        FROM GlaucomaTreatmentPlans
        WHERE patient_id = ?
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1`,
        [patientId]
      );
      
      if (plans.length === 0) {
        // ถ้าไม่มี treatment plan หรือไม่ได้กำหนด target IOP
        // ใช้ค่า default 21 mmHg (มาตรฐานทั่วไป)
        return {
          left_eye: 21,
          right_eye: 21,
          is_default: true
        };
      }
      
      return {
        left_eye: plans[0].target_iop_left ? 
                 parseFloat(plans[0].target_iop_left) : 21,
        right_eye: plans[0].target_iop_right ? 
                  parseFloat(plans[0].target_iop_right) : 21,
        is_default: !plans[0].target_iop_left && !plans[0].target_iop_right,
        updated_at: plans[0].updated_at
      };
      
    } catch (error) {
      console.error('Error getting target IOP:', error.message);
      throw error;
    }
  }
  
  /**
   * ดึงประวัติการวัด IOP ย้อนหลัง
   * @param {string} patientId - รหัสผู้ป่วย
   * @param {number} days - จำนวนวันย้อนหลัง (default = 30)
   * @returns {array} รายการผลการวัด IOP
   */
  async getIOPMeasurements(patientId, days = 30) {
    try {
      // คำนวณวันที่เริ่มต้น
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const [measurements] = await db.query(
        `SELECT 
          measurement_id,
          measurement_date,
          measurement_time,
          left_eye_iop,
          right_eye_iop,
          measurement_device,
          measurement_method,
          measured_at_hospital,
          notes
        FROM IOP_Measurements
        WHERE patient_id = ?
          AND measurement_date >= ?
        ORDER BY measurement_date DESC, measurement_time DESC`,
        [patientId, startDate.toISOString().split('T')[0]]
      );
      
      return measurements;
      
    } catch (error) {
      console.error('Error getting IOP measurements:', error.message);
      throw error;
    }
  }
  
  /**
   * ดึงประวัติ IOP พร้อมตรวจสอบว่าเกิน target หรือไม่
   * @param {string} patientId - รหัสผู้ป่วย
   * @param {number} days - จำนวนวันย้อนหลัง
   * @returns {object} ข้อมูลครบถ้วนพร้อม target และ measurements
   */
  async getIOPHistory(patientId, days = 30) {
    try {
      // ดึง target IOP จาก treatment plan
      const targetIOP = await this.getTargetIOP(patientId);
      
      // ดึงประวัติการวัด
      const measurements = await this.getIOPMeasurements(patientId, days);
      
      // ตรวจสอบแต่ละครั้งว่าเกิน target หรือไม่
      const measurementsWithStatus = measurements.map(measurement => {
        const leftAbove = measurement.left_eye_iop && 
                         parseFloat(measurement.left_eye_iop) > targetIOP.left_eye;
        const rightAbove = measurement.right_eye_iop && 
                          parseFloat(measurement.right_eye_iop) > targetIOP.right_eye;
        
        return {
          measurement_id: measurement.measurement_id,
          measurement_date: measurement.measurement_date,
          measurement_time: measurement.measurement_time,
          left_eye_iop: measurement.left_eye_iop ? 
                       parseFloat(measurement.left_eye_iop) : null,
          right_eye_iop: measurement.right_eye_iop ? 
                        parseFloat(measurement.right_eye_iop) : null,
          measurement_device: measurement.measurement_device,
          measurement_method: measurement.measurement_method,
          measured_at_hospital: Boolean(measurement.measured_at_hospital),
          notes: measurement.notes,
          is_above_target: leftAbove || rightAbove, // เกินอย่างน้อยข้างหนึ่ง
          details: {
            left_above: leftAbove,
            right_above: rightAbove
          }
        };
      });
      
      return {
        target_iop: targetIOP,
        total_measurements: measurementsWithStatus.length,
        measurements: measurementsWithStatus
      };
      
    } catch (error) {
      console.error('Error getting IOP history:', error.message);
      throw error;
    }
  }
  
  /**
   * จัดรูปแบบข้อมูลสำหรับกราฟ (Chart Data)
   * @param {string} patientId - รหัสผู้ป่วย
   * @param {number} days - จำนวนวันย้อนหลัง
   * @returns {object} ข้อมูลพร้อมใช้กับ charting library
   */
  async getIOPChartData(patientId, days = 30) {
    try {
      // ดึง target IOP
      const targetIOP = await this.getTargetIOP(patientId);
      
      // ดึงประวัติการวัด
      const measurements = await this.getIOPMeasurements(patientId, days);
      
      // จัดรูปแบบสำหรับกราฟ (เรียงจากเก่า → ใหม่)
      const chartData = measurements
        .reverse() // กลับลำดับเพื่อให้เรียงจากเก่าไปใหม่
        .map(measurement => ({
          date: measurement.measurement_date,
          time: measurement.measurement_time,
          left: measurement.left_eye_iop ? 
               parseFloat(measurement.left_eye_iop) : null,
          right: measurement.right_eye_iop ? 
                parseFloat(measurement.right_eye_iop) : null,
          // รวมวันที่และเวลาสำหรับ label
          datetime: `${measurement.measurement_date} ${measurement.measurement_time}`,
          // ข้อมูลเพิ่มเติม
          device: measurement.measurement_device,
          at_hospital: Boolean(measurement.measured_at_hospital)
        }));
      
      return {
        target_left: targetIOP.left_eye,
        target_right: targetIOP.right_eye,
        is_default_target: targetIOP.is_default,
        period_days: days,
        data_points: chartData.length,
        chart_data: chartData
      };
      
    } catch (error) {
      console.error('Error getting IOP chart data:', error.message);
      throw error;
    }
  }
}

module.exports = new IOPService();