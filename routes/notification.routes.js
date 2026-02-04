// routes/notification.routes.js

const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const notificationController = require('../controllers/notification.controller');

// ============================================
// Patient Routes (ผู้ป่วย)
// ============================================

/**
 * ดึงรายการ Notifications
 * GET /api/notifications
 * Query params:
 *   - is_read: true/false (optional)
 *   - type: notification_type (optional)
 *   - limit: จำนวน (default: 50)
 *   - offset: เริ่มต้น (default: 0)
 */
router.get('/',
  verifyToken,
  verifyRole(['patient']),
  notificationController.getNotifications
);

/**
 * นับจำนวนที่ยังไม่อ่าน
 * GET /api/notifications/unread-count
 */
router.get('/unread-count',
  verifyToken,
  verifyRole(['patient']),
  notificationController.getUnreadCount
);

/**
 * Mark notification as read
 * PUT /api/notifications/:notificationId/read
 */
router.put('/:notificationId/read',
  verifyToken,
  verifyRole(['patient']),
  notificationController.markAsRead
);

/**
 * Mark all as read
 * PUT /api/notifications/read-all
 */
router.put('/read-all',
  verifyToken,
  verifyRole(['patient']),
  notificationController.markAllAsRead
);

/**
 * ลบ Notification
 * DELETE /api/notifications/:notificationId
 */
router.delete('/:notificationId',
  verifyToken,
  verifyRole(['patient']),
  notificationController.deleteNotification
);

/**
 * ลงทะเบียน Push Token
 * POST /api/notifications/push-token
 * Body: {
 *   expo_push_token: string,
 *   device_type: 'ios' | 'android',
 *   device_name: string (optional)
 * }
 */
router.post('/push-token',
  verifyToken,
  verifyRole(['patient']),
  notificationController.registerPushToken
);

/**
 * ทดสอบส่ง Push Notification
 * POST /api/notifications/test-push
 */
router.post('/test-push',
  verifyToken,
  verifyRole(['patient']),
  notificationController.testPushNotification
);

// ============================================
// Doctor/Admin Routes (แพทย์/แอดมิน)
// ============================================

/**
 * ส่งข้อความหาผู้ป่วย
 * POST /api/notifications/send-message
 * Body: {
 *   patient_ids: string[] | string,  // Array หรือ ID เดี่ยว
 *   title: string,
 *   body: string,
 *   priority: 'low' | 'medium' | 'high' | 'urgent' (optional)
 * }
 */
router.post('/send-message',
  verifyToken,
  verifyRole(['doctor', 'admin']),
  notificationController.sendCustomMessage
);

/**
 * ประกาศหาผู้ป่วยทุกคน (Admin เท่านั้น)
 * POST /api/notifications/announce-all
 * Body: {
 *   title: string,
 *   body: string,
 *   priority: 'low' | 'medium' | 'high' | 'urgent' (optional)
 * }
 */
router.post('/announce-all',
  verifyToken,
  verifyRole(['admin']),
  notificationController.announceToAll
);

module.exports = router;