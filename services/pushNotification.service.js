// services/pushNotification.service.js

const { Expo } = require('expo-server-sdk');
const db = require('../config/database.config');

// สร้าง Expo client
const expo = new Expo();

/**
 * ดึง Push Tokens ของผู้ใช้
 */
async function getPushTokens(userId) {
  try {
    const [tokens] = await db.query(
      `SELECT expo_push_token, device_type 
       FROM PushTokens 
       WHERE patient_id = ? AND is_active = 1`,
      [userId]
    );
    
    // กรอง token ที่ valid
    return tokens
      .filter(t => Expo.isExpoPushToken(t.expo_push_token))
      .map(t => t.expo_push_token);
      
  } catch (error) {
    console.error('Error getting push tokens:', error);
    return [];
  }
}

/**
 * ส่ง Push Notification
 */
async function sendPushNotification(userId, notification) {
  try {
    // 1. ดึง Push Tokens
    const pushTokens = await getPushTokens(userId);
    
    if (pushTokens.length === 0) {
      console.log(`No push tokens for user ${userId}`);
      return { success: false, reason: 'no_tokens' };
    }
    
    // 2. สร้าง messages
    const messages = pushTokens.map(token => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      priority: notification.priority === 'urgent' || notification.priority === 'high' ? 'high' : 'normal',
      badge: notification.badge || 1,
      channelId: 'default' // สำหรับ Android
    }));
    
    // 3. แบ่ง chunks (Expo จำกัด 100 messages/request)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    
    // 4. ส่ง notifications
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        console.log(`✅ Sent ${chunk.length} push notifications`);
      } catch (error) {
        console.error('Error sending chunk:', error);
      }
    }
    
    // 4. ตรวจสอบ tickets และ deactivate token ที่ไม่ valid
    await handlePushTickets(tickets, pushTokens);

    // 5. บันทึก log
    await logNotificationHistory(userId, notification, tickets);
    
    return { success: true, tickets };
    
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ตรวจสอบ tickets หลังส่ง push
 * - ถ้า status = 'error' และ error = 'DeviceNotRegistered'
 *   → deactivate token นั้นใน DB ป้องกันส่งซ้ำรอบหน้า
 */
async function handlePushTickets(tickets, pushTokens) {
  try {
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const token = pushTokens[i];

      if (!ticket || !token) continue;

      if (ticket.status === 'error') {
        const errorType = ticket.details?.error;
        console.warn(`⚠️ [Push] Ticket error for token ${token}: ${errorType}`);

        if (errorType === 'DeviceNotRegistered') {
          // ผู้ใช้ถอนสิทธิ์หรือ uninstall app แล้ว → deactivate token
          await db.query(
            `UPDATE PushTokens SET is_active = 0 WHERE expo_push_token = ?`,
            [token]
          );
          console.log(`🗑️ [Push] Token deactivated (DeviceNotRegistered): ${token}`);

        } else if (errorType === 'InvalidCredentials') {
          // FCM/APNs credentials หมดอายุ → log warning ให้ทีม dev ดู
          console.error('❌ [Push] Invalid credentials — ตรวจสอบ FCM/APNs config');
        }
      }
    }
  } catch (error) {
    console.error('❌ [Push] handlePushTickets error:', error);
  }
}

/**
 * บันทึก Notification History
 */
async function logNotificationHistory(userId, notification, tickets) {
  try {
    const historyId = generateHistoryId();
    
    // นับจำนวนที่ส่งสำเร็จ
    const successCount = tickets.filter(t => t.status === 'ok').length;
    const errorCount = tickets.filter(t => t.status === 'error').length;
    
    await db.query(
      `INSERT INTO NotificationHistory (
        notification_id,
        patient_id,
        notification_type,
        title,
        body,
        sent_at,
        delivered,
        opened
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, FALSE)`,
      [
        historyId,
        userId,
        notification.type,
        notification.title,
        notification.body,
        successCount > 0 ? 1 : 0
      ]
    );
    
    console.log(`📝 Notification history logged: ${successCount} sent, ${errorCount} failed`);
    
  } catch (error) {
    console.error('Error logging notification history:', error);
  }
}

/**
 * ตรวจสอบว่าสามารถส่ง Notification ได้หรือไม่
 * - เช็ค push_enabled
 * - เช็ค Quiet Hours
 */
async function canSendNotification(userId, notificationType) {
  try {
    const [settings] = await db.query(
      `SELECT 
        push_enabled,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end
       FROM NotificationSettings 
       WHERE patient_id = ?`,
      [userId]
    );
    
    // ถ้าไม่มี settings หรือปิดการแจ้งเตือน
    if (settings.length === 0 || !settings[0].push_enabled) {
      return false;
    }
    
    const config = settings[0];
    
    // เช็ค Quiet Hours (ไม่รบกวนตอนกลางคืน)
    if (config.quiet_hours_enabled) {
      const now = new Date();
      // ✅ แก้: ใช้ explicit format แทน toTimeString() ที่อาจต่างกันบาง platform
      const hh = now.getHours().toString().padStart(2, '0');
      const mm = now.getMinutes().toString().padStart(2, '0');
      const ss = now.getSeconds().toString().padStart(2, '0');
      const currentTime = `${hh}:${mm}:${ss}`;
      
      const start = config.quiet_hours_start;
      const end = config.quiet_hours_end;
      
      // กรณี quiet hours ข้ามวัน (เช่น 22:00 - 07:00)
      if (start > end) {
        if (currentTime >= start || currentTime <= end) {
          console.log(`⏸️ Quiet hours active for user ${userId}`);
          return false;
        }
      } else {
        // กรณีไม่ข้ามวัน (เช่น 01:00 - 06:00)
        if (currentTime >= start && currentTime <= end) {
          console.log(`⏸️ Quiet hours active for user ${userId}`);
          return false;
        }
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('Error checking notification settings:', error);
    return true; // Default: อนุญาต
  }
}

/**
 * ลงทะเบียน Push Token
 */
async function registerPushToken(userId, tokenData) {
  try {
    const { expo_push_token, device_type, device_name } = tokenData;
    
    // Validate token
    if (!Expo.isExpoPushToken(expo_push_token)) {
      throw new Error('Invalid Expo push token');
    }
    
    // เช็คว่ามี token นี้อยู่แล้วหรือไม่
    const [existing] = await db.query(
      'SELECT token_id FROM PushTokens WHERE expo_push_token = ?',
      [expo_push_token]
    );
    
    if (existing.length > 0) {
      // อัพเดต
      await db.query(
        `UPDATE PushTokens 
         SET patient_id = ?, device_type = ?, device_name = ?, 
             is_active = 1, last_used_at = NOW()
         WHERE expo_push_token = ?`,
        [userId, device_type, device_name, expo_push_token]
      );
      
      console.log(`✅ Push token updated for user ${userId}`);
    } else {
      // สร้างใหม่
      const tokenId = generateTokenId();
      await db.query(
        `INSERT INTO PushTokens (
          token_id, patient_id, expo_push_token, 
          device_type, device_name, is_active
        ) VALUES (?, ?, ?, ?, ?, 1)`,
        [tokenId, userId, expo_push_token, device_type, device_name]
      );
      
      console.log(`✅ Push token registered for user ${userId}`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Error registering push token:', error);
    throw error;
  }
}

/**
 * Generate IDs
 */
function generateHistoryId() {
  const timestamp = Date.now().toString().slice(-10);
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `HIST${timestamp}${random}`;
}

function generateTokenId() {
  const timestamp = Date.now().toString().slice(-10);
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `TOKEN${timestamp}${random}`;
}

module.exports = {
  sendPushNotification,
  getPushTokens,
  canSendNotification,
  registerPushToken
};