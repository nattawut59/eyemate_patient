// services/medicalDocument.service.js
const db = require('../config/database.config');

/**
 * Medical Document Service
 * Business logic สำหรับจัดการไฟล์เอกสารทางการแพทย์
 */

/**
 * ดึงรายการไฟล์เอกสารทางการแพทย์ของผู้ป่วย
 * 
 * @param {string} patientId - รหัสผู้ป่วย
 * @param {object} filters - เงื่อนไขการ filter
 * @returns {Promise<Array>} รายการไฟล์เอกสาร
 */
async function getMedicalDocuments(patientId, filters = {}) {
  try {
    // สร้าง base query
    let query = `
      SELECT 
        md.document_id,
        md.document_type,
        md.document_title,
        md.file_url,
        md.file_size,
        md.file_format,
        md.upload_date,
        md.description,
        md.tags,
        md.visit_id,
        md.is_archived,
        md.uploaded_by,
        pv.visit_date,
        pv.visit_type,
        u.role as uploader_role,
        pp.first_name as patient_uploader_first_name,
        pp.last_name as patient_uploader_last_name,
        dp.first_name as doctor_uploader_first_name,
        dp.last_name as doctor_uploader_last_name
      FROM MedicalDocuments md
      LEFT JOIN PatientVisits pv ON md.visit_id = pv.visit_id
      LEFT JOIN users u ON md.uploaded_by = u.user_id
      LEFT JOIN PatientProfiles pp ON md.uploaded_by = pp.patient_id
      LEFT JOIN DoctorProfiles dp ON md.uploaded_by = dp.doctor_id
      WHERE md.patient_id = ?
        AND md.is_archived = 0
    `;
    
    const queryParams = [patientId];
    
    // เพิ่ม filters
    if (filters.documentType) {
      query += ' AND md.document_type = ?';
      queryParams.push(filters.documentType);
    }
    
    if (filters.startDate) {
      query += ' AND DATE(md.upload_date) >= ?';
      queryParams.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ' AND DATE(md.upload_date) <= ?';
      queryParams.push(filters.endDate);
    }
    
    if (filters.visitId) {
      query += ' AND md.visit_id = ?';
      queryParams.push(filters.visitId);
    }
    
    // เรียงตามวันที่อัพโหลดล่าสุด
    query += ' ORDER BY md.upload_date DESC';
    
    // Pagination
    if (filters.limit) {
      query += ' LIMIT ?';
      queryParams.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        queryParams.push(filters.offset);
      }
    }
    
    const [documents] = await db.query(query, queryParams);
    
    // แปลงข้อมูลให้อยู่ในรูปแบบที่เหมาะสม
    const formattedDocuments = documents.map(doc => {
      // กำหนดชื่อผู้อัพโหลดตาม role
      let uploadedByName = 'ไม่ทราบชื่อ';
      if (doc.uploader_role === 'patient' && doc.patient_uploader_first_name) {
        uploadedByName = `${doc.patient_uploader_first_name} ${doc.patient_uploader_last_name}`;
      } else if (doc.uploader_role === 'doctor' && doc.doctor_uploader_first_name) {
        uploadedByName = `นพ.${doc.doctor_uploader_first_name} ${doc.doctor_uploader_last_name}`;
      } else if (doc.uploader_role === 'admin') {
        uploadedByName = 'ผู้ดูแลระบบ';
      }
      
      return {
        document_id: doc.document_id,
        document_type: doc.document_type,
        document_title: doc.document_title,
        file_format: doc.file_format,
        file_size: doc.file_size,
        file_size_mb: (doc.file_size / (1024 * 1024)).toFixed(2), // แปลงเป็น MB
        upload_date: doc.upload_date,
        description: doc.description,
        tags: doc.tags ? doc.tags.split(',') : [], // แปลง string เป็น array
        visit_info: doc.visit_id ? {
          visit_id: doc.visit_id,
          visit_date: doc.visit_date,
          visit_type: doc.visit_type
        } : null,
        uploaded_by: uploadedByName,
        is_archived: doc.is_archived === 1,
        // ไม่ส่ง file_url เพื่อความปลอดภัย (ต้องใช้ download endpoint)
        can_download: true
      };
    });
    
    return formattedDocuments;
    
  } catch (error) {
    console.error('Error in getMedicalDocuments service:', error.message);
    throw error;
  }
}

/**
 * ดึงข้อมูลไฟล์เอกสารทางการแพทย์ตาม ID
 * 
 * @param {string} patientId - รหัสผู้ป่วย
 * @param {string} documentId - รหัสเอกสาร
 * @returns {Promise<object|null>} ข้อมูลไฟล์เอกสาร
 */
async function getMedicalDocumentById(patientId, documentId) {
  try {
    const query = `
      SELECT 
        md.document_id,
        md.patient_id,
        md.document_type,
        md.document_title,
        md.file_size,
        md.file_format,
        md.upload_date,
        md.description,
        md.tags,
        md.visit_id,
        md.is_archived,
        md.created_at,
        md.updated_at,
        md.uploaded_by,
        pv.visit_date,
        pv.visit_type,
        pv.chief_complaint,
        u.role as uploader_role,
        pp_uploader.first_name as patient_uploader_first_name,
        pp_uploader.last_name as patient_uploader_last_name,
        dp_uploader.first_name as doctor_uploader_first_name,
        dp_uploader.last_name as doctor_uploader_last_name,
        dp_visit.first_name as doctor_visit_first_name,
        dp_visit.last_name as doctor_visit_last_name
      FROM MedicalDocuments md
      LEFT JOIN PatientVisits pv ON md.visit_id = pv.visit_id
      LEFT JOIN DoctorProfiles dp_visit ON pv.doctor_id = dp_visit.doctor_id
      LEFT JOIN users u ON md.uploaded_by = u.user_id
      LEFT JOIN PatientProfiles pp_uploader ON md.uploaded_by = pp_uploader.patient_id
      LEFT JOIN DoctorProfiles dp_uploader ON md.uploaded_by = dp_uploader.doctor_id
      WHERE md.document_id = ?
        AND md.patient_id = ?
        AND md.is_archived = 0
    `;
    
    const [documents] = await db.query(query, [documentId, patientId]);
    
    if (documents.length === 0) {
      // ตรวจสอบว่าเอกสารมีอยู่แต่เป็นของผู้ป่วยคนอื่น
      const [checkDoc] = await db.query(
        'SELECT document_id FROM MedicalDocuments WHERE document_id = ?',
        [documentId]
      );
      
      if (checkDoc.length > 0) {
        throw new Error('ไม่มีสิทธิ์เข้าถึงไฟล์นี้');
      }
      
      return null;
    }
    
    const doc = documents[0];
    
    // กำหนดชื่อผู้อัพโหลดตาม role
    let uploadedByName = 'ไม่ทราบชื่อ';
    if (doc.uploader_role === 'patient' && doc.patient_uploader_first_name) {
      uploadedByName = `${doc.patient_uploader_first_name} ${doc.patient_uploader_last_name}`;
    } else if (doc.uploader_role === 'doctor' && doc.doctor_uploader_first_name) {
      uploadedByName = `นพ.${doc.doctor_uploader_first_name} ${doc.doctor_uploader_last_name}`;
    } else if (doc.uploader_role === 'admin') {
      uploadedByName = 'ผู้ดูแลระบบ';
    }
    
    // กำหนดชื่อแพทย์ที่ตรวจ (จาก visit)
    let doctorName = null;
    if (doc.doctor_visit_first_name) {
      doctorName = `นพ.${doc.doctor_visit_first_name} ${doc.doctor_visit_last_name}`;
    }
    
    // แปลงข้อมูลให้อยู่ในรูปแบบที่เหมาะสม
    return {
      document_id: doc.document_id,
      document_type: doc.document_type,
      document_title: doc.document_title,
      file_format: doc.file_format,
      file_size: doc.file_size,
      file_size_mb: (doc.file_size / (1024 * 1024)).toFixed(2),
      upload_date: doc.upload_date,
      description: doc.description,
      tags: doc.tags ? doc.tags.split(',') : [],
      visit_info: doc.visit_id ? {
        visit_id: doc.visit_id,
        visit_date: doc.visit_date,
        visit_type: doc.visit_type,
        chief_complaint: doc.chief_complaint,
        doctor_name: doctorName
      } : null,
      uploaded_by: uploadedByName,
      is_archived: doc.is_archived === 1,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      can_download: true
    };
    
  } catch (error) {
    console.error('Error in getMedicalDocumentById service:', error.message);
    throw error;
  }
}

/**
 * ดึงข้อมูลไฟล์สำหรับการดาวน์โหลด (ตรวจสอบสิทธิ์)
 * 
 * @param {string} patientId - รหัสผู้ป่วย
 * @param {string} documentId - รหัสเอกสาร
 * @returns {Promise<object|null>} ข้อมูลไฟล์
 */
async function getFileInfoForDownload(patientId, documentId) {
  try {
    const query = `
      SELECT 
        document_id,
        patient_id,
        document_title,
        file_url,
        file_size,
        file_format
      FROM MedicalDocuments
      WHERE document_id = ?
        AND patient_id = ?
        AND is_archived = 0
    `;
    
    const [files] = await db.query(query, [documentId, patientId]);
    
    if (files.length === 0) {
      // ตรวจสอบว่าไฟล์มีอยู่แต่เป็นของผู้ป่วยคนอื่น
      const [checkFile] = await db.query(
        'SELECT document_id FROM MedicalDocuments WHERE document_id = ?',
        [documentId]
      );
      
      if (checkFile.length > 0) {
        throw new Error('ไม่มีสิทธิ์เข้าถึงไฟล์นี้');
      }
      
      return null;
    }
    
    return files[0];
    
  } catch (error) {
    console.error('Error in getFileInfoForDownload service:', error.message);
    throw error;
  }
}

/**
 * บันทึก log การดาวน์โหลดไฟล์
 * 
 * @param {string} patientId - รหัสผู้ป่วย
 * @param {string} documentId - รหัสเอกสาร
 */
async function logDownload(patientId, documentId) {
  try {
    // บันทึกใน DocumentAccess table (ถ้ามี)
    // หรือบันทึกใน AuditLogs
    
    // ตัวอย่างการบันทึกใน DocumentAccess
    const accessId = 'ACC' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
    
    await db.query(`
      INSERT INTO DocumentAccess (
        access_id,
        document_id,
        user_id,
        access_type,
        access_time,
        access_result,
        ip_address
      ) VALUES (?, ?, ?, 'download', NOW(), 'success', '0.0.0.0')
    `, [accessId, documentId, patientId]);
    
  } catch (error) {
    // Log error แต่ไม่ throw เพื่อไม่ให้กระทบการดาวน์โหลด
    console.error('Error logging download:', error.message);
  }
}

/**
 * นับจำนวนเอกสารทั้งหมดของผู้ป่วย
 * 
 * @param {string} patientId - รหัสผู้ป่วย
 * @returns {Promise<object>} สถิติเอกสาร
 */
async function getDocumentStatistics(patientId) {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_documents,
        COUNT(DISTINCT document_type) as document_types,
        SUM(file_size) as total_size,
        MAX(upload_date) as latest_upload
      FROM MedicalDocuments
      WHERE patient_id = ?
        AND is_archived = 0
    `;
    
    const [stats] = await db.query(query, [patientId]);
    
    return {
      total_documents: stats[0].total_documents,
      document_types: stats[0].document_types,
      total_size: stats[0].total_size,
      total_size_mb: (stats[0].total_size / (1024 * 1024)).toFixed(2),
      latest_upload: stats[0].latest_upload
    };
    
  } catch (error) {
    console.error('Error in getDocumentStatistics service:', error.message);
    throw error;
  }
}

module.exports = {
  getMedicalDocuments,
  getMedicalDocumentById,
  getFileInfoForDownload,
  logDownload,
  getDocumentStatistics
};