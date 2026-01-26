const symptomService = require('../services/symptom.service');

/**
 * บันทึกอาการผิดปกติ
 * @route POST /api/patients/symptoms
 */
async function createSymptomLog(req, res) {
  try {
    const patientId = req.user.userId;
    const symptomData = {
      patient_id: patientId,
      symptom_date: req.body.symptom_date,
      symptom_time: req.body.symptom_time,
      symptom_type: req.body.symptom_type,
      severity: req.body.severity,
      description: req.body.description,
      affected_eye: req.body.affected_eye
    };
    
    const result = await symptomService.createSymptomLog(symptomData);
    
    return res.status(201).json({
      success: true,
      message: 'บันทึกอาการเรียบร้อยแล้ว',
      data: {
        symptom_log_id: result.symptomLogId
      }
    });
    
  } catch (error) {
    console.error('Error in createSymptomLog:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการบันทึกอาการ'
    });
  }
}

/**
 * ดูประวัติอาการผิดปกติของตนเอง
 * @route GET /api/patients/symptoms
 */
async function getMySymptomLogs(req, res) {
  try {
    const patientId = req.user.userId;
    
    // Query parameters สำหรับการกรอง
    const filters = {
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      symptomType: req.query.symptom_type,
      affectedEye: req.query.affected_eye,
      minSeverity: req.query.min_severity,
      limit: req.query.limit || 50
    };
    
    const symptomLogs = await symptomService.getSymptomLogsByPatient(patientId, filters);
    
    return res.json({
      success: true,
      data: {
        total: symptomLogs.length,
        symptom_logs: symptomLogs
      }
    });
    
  } catch (error) {
    console.error('Error in getMySymptomLogs:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอาการ'
    });
  }
}

/**
 * ดูรายละเอียดอาการ 1 รายการ
 * @route GET /api/patients/symptoms/:symptom_id
 */
async function getSymptomLogById(req, res) {
  try {
    const patientId = req.user.userId;
    const symptomId = req.params.symptom_id;
    
    const symptomLog = await symptomService.getSymptomLogById(symptomId, patientId);
    
    if (!symptomLog) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลอาการนี้'
      });
    }
    
    return res.json({
      success: true,
      data: symptomLog
    });
    
  } catch (error) {
    console.error('Error in getSymptomLogById:', error.message);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอาการ'
    });
  }
}

module.exports = {
  createSymptomLog,
  getMySymptomLogs,
  getSymptomLogById
};