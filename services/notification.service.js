// services/notification.service.js

const db = require('../config/database.config');
const pushNotificationService = require('./pushNotification.service');

/**
 * สร้างและส่ง Notification แบบครบวงจร
 * @param {Object} params
 * @param {string} params.userId - ID ของผู้รับ (patient_id, doctor_id, admin_id)
 * @param {string} params.type - notification_type
 * @param {string} params.title - หัวข้อ
 * @param {string} params.body - เนื้อหา
 * @param {string} params.relatedType - 'appointment', 'document', 'medication', etc.
 * @param {string} params.relatedId - ID ของ entity ที่เกี่ยวข้อง
 * @param {string} params.priority - 'low', 'medium', 'high', 'urgent'
 * @param {Object} params.data - ข้อมูลเพิ่มเติมสำหรับ push notification
 * @param {boolean} params.sendPush - ส่ง push notification หรือไม่ (default: true)
 */
async function createAndSendNotification({
  userId,
  type,
  title,
  body,
  relatedType = null,
  relatedId = null,
  priority = 'medium',
  data = {},
  sendPush = true
}) {
  try {
    // 1. สร้าง Notification ID
    const notificationId = generateNotificationId();
    
    // 2. บันทึกลง Notifications table
    await db.query(
      `INSERT INTO Notifications (
        notification_id,
        user_id,
        notification_type,
        title,
        body,
        related_entity_type,
        related_entity_id,
        priority,
        is_read,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
      [
        notificationId,
        userId,
        type,
        title,
        body,
        relatedType,
        relatedId,
        priority
      ]
    );
    
    console.log(`✅ Notification saved: ${notificationId} for user ${userId}`);
    
    // 3. ส่ง Push Notification (ถ้าเปิด)
    if (sendPush) {
      // เช็คว่าผู้ใช้เปิดการแจ้งเตือนหรือไม่
      const canSend = await pushNotificationService.canSendNotification(userId, type);
      
      if (canSend) {
        // ส่งแบบ non-blocking (ไม่ให้ error ของ push ทำให้ API fail)
        pushNotificationService.sendPushNotification(userId, {
          type,
          title,
          body,
          data: {
            ...data,
            notification_id: notificationId,
            type: relatedType,
            entity_id: relatedId
          },
          priority
        }).catch(err => {
          console.error('Push notification error:', err.message);
        });
      } else {
        console.log(`⏸️ Push notification skipped for user ${userId} (disabled or quiet hours)`);
      }
    }
    
    return {
      success: true,
      notification_id: notificationId
    };
    
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * ส่ง Notification หาหลายคนพร้อมกัน
 * @param {Array} userIds - Array ของ user_id
 * @param {Object} notification - ข้อมูล notification เหมือน createAndSendNotification
 */
async function createAndSendBulkNotification(userIds, notification) {
  try {
    const results = [];
    
    for (const userId of userIds) {
      const result = await createAndSendNotification({
        ...notification,
        userId
      });
      results.push(result);
    }
    
    console.log(`✅ Bulk notification sent to ${userIds.length} users`);
    
    return {
      success: true,
      sent_count: results.length,
      results
    };
    
  } catch (error) {
    console.error('Error sending bulk notification:', error);
    throw error;
  }
}

/**
 * ส่ง Notification หาผู้ป่วยทุกคน (Admin Announcement)
 */
async function sendToAllPatients(notification) {
  try {
    // ดึง patient_id ทั้งหมดที่ active
    const [patients] = await db.query(
      `SELECT patient_id 
       FROM PatientProfiles p
       JOIN users u ON p.patient_id = u.user_id
       WHERE u.status = 'active'`
    );
    
    const patientIds = patients.map(p => p.patient_id);
    
    return await createAndSendBulkNotification(patientIds, notification);
    
  } catch (error) {
    console.error('Error sending to all patients:', error);
    throw error;
  }
}

/**
 * Mark notification as read
 */
async function markAsRead(notificationId, userId) {
  try {
    await db.query(
      `UPDATE Notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE notification_id = ? AND user_id = ?`,
      [notificationId, userId]
    );
    
    return { success: true };
    
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(userId) {
  try {
    await db.query(
      `UPDATE Notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );
    
    return { success: true };
    
  } catch (error) {
    console.error('Error marking all as read:', error);
    throw error;
  }
}

/**
 * ลบ Notification
 */
async function deleteNotification(notificationId, userId) {
  try {
    const [result] = await db.query(
      `DELETE FROM Notifications 
       WHERE notification_id = ? AND user_id = ?`,
      [notificationId, userId]
    );
    
    if (result.affectedRows === 0) {
      throw new Error('ไม่พบการแจ้งเตือนหรือไม่มีสิทธิ์ลบ');
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
}

/**
 * ดึง Notifications ของผู้ใช้
 */
async function getNotifications(userId, options = {}) {
  try {
    const {
      isRead = null,
      type = null,
      limit = 50,
      offset = 0
    } = options;
    
    let query = `
      SELECT 
        notification_id,
        notification_type,
        title,
        body,
        related_entity_type,
        related_entity_id,
        priority,
        is_read,
        read_at,
        created_at
      FROM Notifications
      WHERE user_id = ?
    `;
    
    const params = [userId];
    
    // Filter by read status
    if (isRead !== null) {
      query += ' AND is_read = ?';
      params.push(isRead);
    }
    
    // Filter by type
    if (type) {
      query += ' AND notification_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [notifications] = await db.query(query, params);
    
    // นับจำนวนที่ยังไม่อ่าน
    const [countResult] = await db.query(
      'SELECT COUNT(*) as unread_count FROM Notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    
    return {
      success: true,
      data: notifications,
      unread_count: countResult[0].unread_count,
      total: notifications.length
    };
    
  } catch (error) {
    console.error('Error getting notifications:', error);
    throw error;
  }
}

/**
 * Generate Notification ID
 */
function generateNotificationId() {
  const timestamp = Date.now().toString().slice(-10);
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `NOTIF${timestamp}${random}`;
}

module.exports = {
  createAndSendNotification,
  createAndSendBulkNotification,
  sendToAllPatients,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotifications
};