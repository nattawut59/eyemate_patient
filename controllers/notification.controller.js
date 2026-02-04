// controllers/notification.controller.js

const notificationService = require('../services/notification.service');
const pushNotificationService = require('../services/pushNotification.service');
const db = require('../config/database.config');
/**
 * ดึงรายการ Notifications ของผู้ใช้
 * GET /api/notifications
 */
async function getNotifications(req, res) {
  try {
    const userId = req.user.userId;
    const { is_read, type, limit, offset } = req.query;
    
    const result = await notificationService.getNotifications(userId, {
      isRead: is_read === 'true' ? true : is_read === 'false' ? false : null,
      type,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    
    return res.json(result);
    
  } catch (error) {
    console.error('Error in getNotifications:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
    });
  }
}

/**
 * นับจำนวน Notifications ที่ยังไม่อ่าน
 * GET /api/notifications/unread-count
 */
async function getUnreadCount(req, res) {
  try {
    const userId = req.user.userId;
    
    const [result] = await db.query(
      'SELECT COUNT(*) as count FROM Notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    
    return res.json({
      success: true,
      unread_count: result[0].count
    });
    
  } catch (error) {
    console.error('Error in getUnreadCount:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการนับข้อมูล'
    });
  }
}

/**
 * Mark notification as read
 * PUT /api/notifications/:notificationId/read
 */
async function markAsRead(req, res) {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;
    
    await notificationService.markAsRead(notificationId, userId);
    
    return res.json({
      success: true,
      message: 'ทำเครื่องหมายว่าอ่านแล้ว'
    });
    
  } catch (error) {
    console.error('Error in markAsRead:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัพเดต'
    });
  }
}

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
async function markAllAsRead(req, res) {
  try {
    const userId = req.user.userId;
    
    await notificationService.markAllAsRead(userId);
    
    return res.json({
      success: true,
      message: 'ทำเครื่องหมายทั้งหมดว่าอ่านแล้ว'
    });
    
  } catch (error) {
    console.error('Error in markAllAsRead:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัพเดต'
    });
  }
}

/**
 * ลบ Notification
 * DELETE /api/notifications/:notificationId
 */
async function deleteNotification(req, res) {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;
    
    await notificationService.deleteNotification(notificationId, userId);
    
    return res.json({
      success: true,
      message: 'ลบการแจ้งเตือนสำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in deleteNotification:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการลบ'
    });
  }
}

/**
 * ลงทะเบียน Push Token
 * POST /api/notifications/push-token
 */
async function registerPushToken(req, res) {
  try {
    const userId = req.user.userId;
    const { expo_push_token, device_type, device_name } = req.body;
    
    // Validate
    if (!expo_push_token) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ expo_push_token'
      });
    }
    
    if (!device_type || !['ios', 'android'].includes(device_type)) {
      return res.status(400).json({
        success: false,
        error: 'device_type ต้องเป็น ios หรือ android'
      });
    }
    
    await pushNotificationService.registerPushToken(userId, {
      expo_push_token,
      device_type,
      device_name
    });
    
    return res.json({
      success: true,
      message: 'ลงทะเบียนอุปกรณ์สำเร็จ'
    });
    
  } catch (error) {
    console.error('Error in registerPushToken:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการลงทะเบียน'
    });
  }
}

/**
 * ส่งข้อความหาผู้ป่วย (สำหรับแพทย์/แอดมิน)
 * POST /api/notifications/send-message
 */
async function sendCustomMessage(req, res) {
  try {
    const senderId = req.user.userId;
    const senderRole = req.user.role;
    const { 
      patient_ids,  // Array หรือ string เดี่ยว
      title, 
      body, 
      priority = 'medium' 
    } = req.body;
    
    // Validate
    if (!patient_ids || (!Array.isArray(patient_ids) && typeof patient_ids !== 'string')) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ patient_ids (array หรือ string)'
      });
    }
    
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ title และ body'
      });
    }
    
    // แปลงเป็น array
    const patientIdsArray = Array.isArray(patient_ids) ? patient_ids : [patient_ids];
    
    // กำหนด notification type ตาม role
    const notificationType = senderRole === 'doctor' ? 'doctor_message' : 'custom_message';
    
    // ส่งหาแต่ละคน
    const results = await notificationService.createAndSendBulkNotification(
      patientIdsArray,
      {
        type: notificationType,
        title,
        body,
        priority,
        relatedType: 'message',
        relatedId: senderId,
        data: {
          sender_id: senderId,
          sender_role: senderRole
        }
      }
    );
    
    return res.json({
      success: true,
      message: `ส่งข้อความถึง ${patientIdsArray.length} คนสำเร็จ`,
      data: results
    });
    
  } catch (error) {
    console.error('Error in sendCustomMessage:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่งข้อความ'
    });
  }
}

/**
 * ประกาศหาผู้ป่วยทุกคน (สำหรับแอดมินเท่านั้น)
 * POST /api/notifications/announce-all
 */
async function announceToAll(req, res) {
  try {
    const { title, body, priority = 'medium' } = req.body;
    
    // Validate
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ title และ body'
      });
    }
    
    // ส่งหาทุกคน
    const result = await notificationService.sendToAllPatients({
      type: 'admin_announcement',
      title,
      body,
      priority,
      relatedType: 'announcement',
      relatedId: req.user.userId
    });
    
    return res.json({
      success: true,
      message: 'ส่งประกาศถึงผู้ป่วยทุกคนสำเร็จ',
      data: result
    });
    
  } catch (error) {
    console.error('Error in announceToAll:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่งประกาศ'
    });
  }
}

/**
 * ทดสอบส่ง Push Notification
 * POST /api/notifications/test-push
 */
async function testPushNotification(req, res) {
  try {
    const userId = req.user.userId;
    const { title = 'ทดสอบ', body = 'นี่คือการทดสอบ Push Notification' } = req.body;
    
    const result = await pushNotificationService.sendPushNotification(userId, {
      type: 'test',
      title,
      body,
      data: { test: true },
      priority: 'high'
    });
    
    return res.json({
      success: true,
      message: 'ส่ง Push Notification ทดสอบสำเร็จ',
      result
    });
    
  } catch (error) {
    console.error('Error in testPushNotification:', error);
    return res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่ง'
    });
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  registerPushToken,
  sendCustomMessage,
  announceToAll,
  testPushNotification
};