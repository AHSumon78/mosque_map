const fs = require('fs');
const csv = require('csv-parser');
const pool = require('../config/db');

/**
 * Controller for Web-based CSV Import
 */
const importController = {
    /**
     * Upload and Import CSV into MySQL
     * POST /api/v1/mosques/import
     */
    async importCSV(req, res) {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No CSV file was uploaded. Please attach a CSV file.'
            });
        }

        const filePath = req.file.path;
        const rows = [];
        let skippedRows = 0;

        try {
            // Parse CSV stream
            await new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
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
                        } else {
                            skippedRows++;
                        }
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });

            if (rows.length === 0) {
                // Cleanup temp file
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                return res.status(400).json({
                    success: false,
                    error: 'CSV contained no valid mosque rows with name, latitude, and longitude.'
                });
            }

            // Batch insert into MySQL
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
                        item.longitude, // POINT(lng, lat)
                        item.latitude
                    );
                }

                const sql = `
                    INSERT INTO mosques (name, latitude, longitude, location)
                    VALUES ${placeholders}
                    ON DUPLICATE KEY UPDATE name = VALUES(name);
                `;

                await pool.query(sql, values);
                processed += batch.length;
            }

            // Cleanup temp file
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

            // Fetch updated database count
            const [stats] = await pool.query('SELECT COUNT(*) as total FROM mosques');

            return res.json({
                success: true,
                message: `Successfully processed ${processed} mosques from CSV.`,
                total_processed: processed,
                skipped_invalid: skippedRows,
                total_in_database: stats[0].total
            });

        } catch (error) {
            console.error('Error importing CSV:', error);
            // Cleanup temp file
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }

            return res.status(500).json({
                success: false,
                error: `CSV Import error: ${error.message}`
            });
        }
    }
};

module.exports = importController;
