

const mysql = require('mysql2/promise');


// สร้าง connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST||'gateway01.ap-northeast-1.prod.aws.tidbcloud.com',
  user: process.env.DB_USER||'43sZQPoB6vQC2k5.root',
  password: process.env.DB_PASSWORD||'3FiK8RuPIkz4vPCA',
  database: process.env.DB_NAME||'EyeMate',
  port: process.env.DB_PORT || 4000,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// ทดสอบ connection
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;