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

                        // Optional female facility detection
                        const rawFemale = data.has_female_facility || data.female_facility || data.women_facility || data.female;
                        const hasFemale = (rawFemale === '1' || rawFemale === 'true' || rawFemale === 'yes' || rawFemale === true) ? 1 : 0;

                        if (name && !isNaN(lat) && !isNaN(lng)) {
                            rows.push({
                                name: String(name).trim(),
                                latitude: lat,
                                longitude: lng,
                                has_female_facility: hasFemale
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
                const placeholders = batch.map(() => `(?, ?, ?, POINT(?, ?), ?)`).join(', ');
                const values = [];

                for (const item of batch) {
                    values.push(
                        item.name,
                        item.latitude,
                        item.longitude,
                        item.longitude, // POINT(lng, lat)
                        item.latitude,
                        item.has_female_facility
                    );
                }

                const sql = `
                    INSERT INTO mosques (name, latitude, longitude, location, has_female_facility)
                    VALUES ${placeholders}
                    ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        has_female_facility = CASE 
                            WHEN VALUES(has_female_facility) = 1 THEN 1 
                            ELSE mosques.has_female_facility 
                        END;
                `;

                await pool.query(sql, values);
                processed += batch.length;
            }

            // Cleanup temp file
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

            // Fetch updated database stats
            const [stats] = await pool.query('SELECT COUNT(*) as total FROM mosques');
            const [femaleStats] = await pool.query('SELECT COUNT(*) as female_total FROM mosques WHERE has_female_facility = 1');

            return res.json({
                success: true,
                message: `Successfully processed ${processed} mosques from CSV.`,
                total_processed: processed,
                skipped_invalid: skippedRows,
                total_in_database: stats[0].total,
                female_facility_mosques: femaleStats[0].female_total
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
