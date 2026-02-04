/**
 * EyeMate Backend API
 * Express Application Configuration
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');


const app = express();

// ============================================
// Middleware
// ============================================

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (process.env.NODE_ENV === 'production') {
      callback(null, true); // อนุญาตทุก origin
    } else {
      const whitelist = [
        'http://localhost:3000',
        'http://localhost:3002',
        'http://localhost:19006',
        'http://localhost:19000',
        process.env.ADMIN_URL,
        process.env.APP_URL
      ].filter(Boolean);
      
      if (!origin || whitelist.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ============================================
// Routes
// ============================================

// ✅ Root endpoint - เพิ่มตรงนี้
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'EyeMate Patient API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      patients: '/api/patients',
      symptoms: '/api/patients/symptoms',
      medications: '/api/patients/medications',
      medicationLogs: '/api/patients/medication-logs',
      iopReadings: '/api/patients/iop-readings',
      medicalFiles: '/api/patients/medical-files',
      medicationReminders: '/api/patients/medication-reminders',
      notifications: '/api/notifications',
      appointments: '/api/appointments'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'EyeMate API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

const authRoutes = require('./routes/auth.routes');
const patientRoutes = require('./routes/patient.routes');
const symptomRoutes = require('./routes/symptom.routes');
const medicationRoutes = require('./routes/medication.routes');
const medicationLogRoutes = require('./routes/medicationLog.routes');
const iopRoutes = require('./routes/iop.routes');
const medicalDocumentRoutes = require('./routes/medicalDocument.routes');
const medicationReminderRoutes = require('./routes/medicationReminder.routes');
const notificationRoutes = require('./routes/notification.routes');
const appointmentRoutes = require('./routes/appointment.routes');


app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/patients/symptoms', symptomRoutes);
app.use('/api/patients/medications', medicationRoutes);
app.use('/api/patients/medication-logs', medicationLogRoutes);
app.use('/api/patients/iop-readings', iopRoutes);
app.use('/api/patients/medical-files', medicalDocumentRoutes);
app.use('/api/patients/medication-reminders', medicationReminderRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'EyeMate API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// ============================================
// Global Error Handler
// ============================================

app.use((err, req, res, next) => {
  console.error('Global error handler:', err.message);
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
  
  return res.status(err.statusCode || 500).json({
    success: false,
    error: 'เกิดข้อผิดพลาดในระบบ'
  });
});

// ============================================
// Export App (ไม่ start server ที่นี่)
// ============================================
const { startAppointmentRemindersCron } = require('./cron/appointmentReminders.cron');
startAppointmentRemindersCron();


module.exports = app;