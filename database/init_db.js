/**
 * Automatic Database & Table Initializer
 * Usage: node database/init_db.js (or npm run setup-db)
 */
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function initDB() {
    console.log('====================================================');
    console.log('🛠️  Initializing Mosque Database & Spatial Schema...');
    console.log('====================================================');

    const host = process.env.DB_HOST || 'localhost';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const port = parseInt(process.env.DB_PORT || '3306', 10);
    const dbName = process.env.DB_NAME || 'mosque_db';

    try {
        // Step 1: Connect to server without database
        const rootConn = await mysql.createConnection({
            host,
            user,
            password,
            port,
            charset: 'utf8mb4'
        });

        console.log(`📡 Connected to MySQL server at ${host}:${port}`);
        await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        console.log(`✅ Database '${dbName}' ready.`);
        await rootConn.end();

        // Step 2: Connect to the database and create/update table
        const conn = await mysql.createConnection({
            host,
            user,
            password,
            port,
            database: dbName,
            charset: 'utf8mb4'
        });

        await conn.query(`
            CREATE TABLE IF NOT EXISTS mosques (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                latitude DECIMAL(10, 7) NOT NULL,
                longitude DECIMAL(10, 7) NOT NULL,
                location POINT NOT NULL,
                has_female_facility BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_coords (latitude, longitude),
                SPATIAL INDEX(location),
                INDEX idx_female (has_female_facility)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Check if has_female_facility column exists (for backward compatibility if table existed earlier)
        const [colCheck] = await conn.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mosques' AND COLUMN_NAME = 'has_female_facility'
        `, [dbName]);

        if (colCheck.length === 0) {
            console.log('🔄 Adding has_female_facility column to existing table...');
            await conn.query(`ALTER TABLE mosques ADD COLUMN has_female_facility BOOLEAN DEFAULT FALSE;`);
            await conn.query(`ALTER TABLE mosques ADD INDEX idx_female (has_female_facility);`);
            console.log('✅ Added has_female_facility column successfully.');
        }

        console.log(`✅ Table 'mosques' with SPATIAL INDEX and 'has_female_facility' column ready.`);

        const [rows] = await conn.query('SELECT COUNT(*) as count FROM mosques');
        console.log(`📊 Current mosques in database: ${rows[0].count}`);
        console.log('====================================================');
        console.log('🎉 Setup Complete! You can now start the server or import CSV.');
        console.log('====================================================');
        await conn.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
        console.error('💡 Please verify your .env file database credentials.');
        process.exit(1);
    }
}

initDB();
