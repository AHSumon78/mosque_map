/**
 * CLI CSV Importer for Mosque Map
 * Usage:
 *   node database/import_cli.js <path-to-csv>
 * Example:
 *   node database/import_cli.js rajshahi_mosques.csv
 */
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runImport() {
    const targetFile = process.argv[2] || path.join(__dirname, '../bangladesh_mosques.csv');
    const resolvedPath = path.resolve(targetFile);

    console.log('====================================================');
    console.log('📥 Mosque Map - CLI CSV Importer');
    console.log(`📁 Source File: ${resolvedPath}`);
    console.log('====================================================');

    if (!fs.existsSync(resolvedPath)) {
        console.error(`❌ Error: File not found at '${resolvedPath}'!`);
        console.log('Usage: node database/import_cli.js <path_to_csv_file>');
        process.exit(1);
    }

    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'mosque_db',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        charset: 'utf8mb4'
    };

    let conn;
    try {
        conn = await mysql.createConnection(dbConfig);
        console.log(`📡 Connected to database '${dbConfig.database}'`);
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('👉 Tip: Run "npm run setup-db" first.');
        process.exit(1);
    }

    // Read and parse CSV
    const rows = [];
    console.log('⏳ Parsing CSV data...');

    await new Promise((resolve, reject) => {
        fs.createReadStream(resolvedPath)
            .pipe(csv())
            .on('data', (data) => {
                const name = data.name || data.Name;
                const lat = parseFloat(data.latitude || data.Latitude || data.lat);
                const lng = parseFloat(data.longitude || data.Longitude || data.lng || data.lon);

                if (name && !isNaN(lat) && !isNaN(lng)) {
                    rows.push({
                        name: String(name).trim(),
                        latitude: lat,
                        longitude: lng
                    });
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    console.log(`📊 Total valid records found in CSV: ${rows.length}`);
    if (rows.length === 0) {
        console.log('⚠️ No valid mosque records found in CSV.');
        await conn.end();
        process.exit(0);
    }

    const BATCH_SIZE = 500;
    let processed = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => `(?, ?, ?, POINT(?, ?))`).join(', ');
        const values = [];

        for (const item of batch) {
            values.push(
                item.name,
                item.latitude,
                item.longitude,
                item.longitude, // POINT(X = lng, Y = lat)
                item.latitude
            );
        }

        const sql = `
            INSERT INTO mosques (name, latitude, longitude, location)
            VALUES ${placeholders}
            ON DUPLICATE KEY UPDATE name = VALUES(name);
        `;

        await conn.query(sql, values);
        processed += batch.length;
        process.stdout.write(`\r🚀 Processed: ${processed} / ${rows.length} records (${Math.round((processed / rows.length) * 100)}%)`);
    }

    console.log('\n');
    const [stats] = await conn.query('SELECT COUNT(*) as total FROM mosques');
    console.log('====================================================');
    console.log(`🎉 Import completed successfully!`);
    console.log(`🕌 Total unique mosques in database: ${stats[0].total}`);
    console.log('====================================================');

    await conn.end();
}

runImport().catch(err => {
    console.error('❌ Import failed:', err);
    process.exit(1);
});
