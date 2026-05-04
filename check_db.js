
const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkSchema() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'visionart_db',
  });

  try {
    const [rows] = await connection.execute('DESCRIBE users');
    console.log('Users Table Structure:');
    console.table(rows);
  } catch (err) {
    console.error('Error describing users table:', err.message);
  } finally {
    await connection.end();
  }
}

checkSchema();
