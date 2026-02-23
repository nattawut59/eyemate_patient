// server.js
require('dotenv').config({ debug: false, override: false });
const app = require('./app');
const db = require('./config/database.config');

const PORT = Number(process.env.PORT) || 8080;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log('===========================================');
  console.log('✅ EyeMate API Server Started');
  console.log('===========================================');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health Check: /health`);
  console.log('===========================================');
});

// ✅ Graceful Shutdown with Database Cleanup
const gracefulShutdown = async (signal) => {
  console.log(`\n👋 ${signal} received, shutting down gracefully...`);
  
  // Close server (stop accepting new connections)
  server.close(async () => {
    console.log('🔌 HTTP server closed');
    
    try {
      // Close database connection pool
      await db.end();
      console.log('🔌 Database connection closed');
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});