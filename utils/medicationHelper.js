// utils/medicationHelper.js

/**
 * คำนวณเวลาหยอดยารอบถัดไป
 */
const calculateNextDoseTime = (currentTime, intervalHours) => {
  const next = new Date(currentTime);
  next.setHours(next.getHours() + intervalHours);
  return next;
};

/**
 * ตรวจสอบว่าเวลาอยู่ใน Sleep Mode หรือไม่
 */
const isWithinSleepMode = (doseTime, sleepModeEnabled, sleepStartTime, sleepEndTime) => {
  if (!sleepModeEnabled) return false;

  const dose = parseTime(doseTime);
  const sleepStart = parseTime(sleepStartTime);
  const sleepEnd = parseTime(sleepEndTime);

  // กรณี Sleep Mode ข้ามวัน (เช่น 22:00 - 06:00)
  if (sleepStart > sleepEnd) {
    return dose >= sleepStart || dose < sleepEnd;
  }

  // กรณีปกติ
  return dose >= sleepStart && dose < sleepEnd;
};

/**
 * แปลง time string เป็น minutes นับจากเที่ยงคืน
 */
const parseTime = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * ดึงรายการเวลาหยอดยาในวันนั้น
 */
const getDoseTimesForDate = (schedule, doseTimes, date) => {
  const result = [];

  if (schedule.frequency_type === 'fixed_times') {
    // ใช้ dose_times ที่กำหนดไว้
    for (const doseTime of doseTimes) {
      const inSleepMode = isWithinSleepMode(
        doseTime.dose_time,
        schedule.sleep_mode_enabled,
        schedule.sleep_start_time,
        schedule.sleep_end_time
      );

      if (schedule.sleep_skip_dose && inSleepMode) {
        continue; // ข้ามรอบที่อยู่ใน sleep mode
      }

      result.push({
        dose_time: doseTime.dose_time,
        dose_label: doseTime.dose_label,
        dose_order: doseTime.dose_order
      });
    }

  } else if (schedule.frequency_type === 'interval') {
    // สร้างเวลาตาม interval_hours
    const timesPerDay = Math.floor(24 / schedule.interval_hours);
    let currentTime = new Date(`${date} 08:00:00`); // เริ่มที่ 08:00

    for (let i = 0; i < timesPerDay; i++) {
      const timeStr = currentTime.toTimeString().split(' ')[0];

      const inSleepMode = isWithinSleepMode(
        timeStr,
        schedule.sleep_mode_enabled,
        schedule.sleep_start_time,
        schedule.sleep_end_time
      );

      if (schedule.sleep_skip_dose && inSleepMode) {
        currentTime.setHours(currentTime.getHours() + schedule.interval_hours);
        continue;
      }

      result.push({
        dose_time: timeStr,
        dose_label: `รอบที่ ${i + 1}`,
        dose_order: i + 1
      });

      currentTime.setHours(currentTime.getHours() + schedule.interval_hours);
    }
  }

  return result;
};

/**
 * ตรวจสอบว่าเวลา 2 เวลาชนกันหรือไม่ (dose spacing)
 */
const checkDoseSpacing = (time1, time2, requiredSpacingMinutes) => {
  const t1 = parseTime(time1);
  const t2 = parseTime(time2);
  const diffMinutes = Math.abs(t1 - t2);

  return diffMinutes < requiredSpacingMinutes;
};

/**
 * แปลง datetime เป็นรูปแบบที่อ่านง่าย (ภาษาไทย)
 */
const formatDateTimeThai = (datetime) => {
  const date = new Date(datetime);
  
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543; // แปลงเป็น พ.ศ.
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
};

/**
 * คำนวณจำนวนวันที่เหลือของยา
 */
const calculateRemainingDays = (endDate) => {
  if (!endDate) return null;

  const today = new Date();
  const end = new Date(endDate);
  const diffTime = end - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
};

/**
 * สร้างข้อความแจ้งเตือนหยอดยา
 */
const generateReminderMessage = (medicationName, doseLabel, doseTime) => {
  return {
    title: `⏰ ถึงเวลาหยอดยา`,
    body: `${medicationName} - ${doseLabel} (${doseTime})`,
    data: {
      type: 'medication_reminder',
      medication: medicationName,
      time: doseTime
    }
  };
};

/**
 * ตรวจสอบว่าถึงเวลาหยอดยาหรือยัง
 */
const isTimeToTakeMedication = (scheduledTime, advanceMinutes = 5) => {
  const now = new Date();
  const scheduled = new Date(scheduledTime);
  
  // ตรวจสอบว่าถึงเวลา (หรือล่วงหน้า advanceMinutes นาที)
  const advanceTime = new Date(scheduled);
  advanceTime.setMinutes(advanceTime.getMinutes() - advanceMinutes);

  return now >= advanceTime && now <= scheduled;
};

/**
 * คำนวณ Compliance Rate
 */
const calculateComplianceRate = (completed, total) => {
  if (total === 0) return 0;
  return ((completed / total) * 100).toFixed(2);
};

/**
 * จัดกลุ่มรายการยาตามเวลา
 */
const groupMedicationsByTime = (medications) => {
  const grouped = {};

  for (const med of medications) {
    const time = med.dose_time || med.scheduled_time;
    if (!grouped[time]) {
      grouped[time] = [];
    }
    grouped[time].push(med);
  }

  return grouped;
};

/**
 * ตรวจสอบว่าควรแจ้งเตือนหรือไม่ (ตาม notification settings)
 */
const shouldSendNotification = (settings, notificationType) => {
  if (!settings.push_enabled) return false;

  // ตรวจสอบ Quiet Hours
  if (settings.quiet_hours_start && settings.quiet_hours_end) {
    const now = new Date();
    const currentTime = now.toTimeString().split(' ')[0];

    const inQuietHours = isWithinSleepMode(
      currentTime,
      true,
      settings.quiet_hours_start,
      settings.quiet_hours_end
    );

    if (inQuietHours) return false;
  }

  return true;
};

module.exports = {
  calculateNextDoseTime,
  isWithinSleepMode,
  getDoseTimesForDate,
  checkDoseSpacing,
  formatDateTimeThai,
  calculateRemainingDays,
  generateReminderMessage,
  isTimeToTakeMedication,
  calculateComplianceRate,
  groupMedicationsByTime,
  shouldSendNotification
};