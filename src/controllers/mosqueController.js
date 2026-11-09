const pool = require('../config/db');

/**
 * Controller for Mosque queries, updates, and spatial calculations
 * Optimized for high-volume 100,000+ records
 */
const mosqueController = {
    /**
     * Get nearby mosques using MySQL Spatial ST_Distance_Sphere
     * GET /api/v1/mosques/nearby?lat=23.7258&lng=90.4127&radius=2000&limit=100&female_only=1
     */
    async getNearbyMosques(req, res) {
        try {
            const lat = parseFloat(req.query.lat);
            const lng = parseFloat(req.query.lng);
            const radius = Math.min(parseInt(req.query.radius || '2000', 10), 30000); // max 30km
            const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);
            const femaleOnly = req.query.female_only === 'true' || req.query.female_only === '1';

            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({
                    success: false,
                    error: 'সঠিক অক্ষাংশ (lat) এবং দ্রাঘিমাংশ (lng) প্রদান করুন।'
                });
            }

            let whereClause = 'WHERE ST_Distance_Sphere(POINT(longitude, latitude), POINT(?, ?)) <= ?';
            const params = [lng, lat, lng, lat, radius];

            if (femaleOnly) {
                whereClause += ' AND has_female_facility = 1';
            }

            const query = `
                SELECT 
                    id,
                    name,
                    latitude,
                    longitude,
                    has_female_facility,
                    ROUND(ST_Distance_Sphere(POINT(longitude, latitude), POINT(?, ?))) AS distance_meters
                FROM mosques
                ${whereClause}
                ORDER BY distance_meters ASC
                LIMIT ?;
            `;

            params.push(limit);

            const [rows] = await pool.query(query, params);

            const cleanRows = rows.map(r => ({
                id: r.id,
                name: r.name,
                latitude: parseFloat(r.latitude),
                longitude: parseFloat(r.longitude),
                has_female_facility: r.has_female_facility,
                distance_meters: r.distance_meters !== null ? parseInt(r.distance_meters, 10) : undefined
            }));

            return res.json({
                success: true,
                query: {
                    latitude: lat,
                    longitude: lng,
                    radius_meters: radius,
                    female_only: femaleOnly,
                    limit: limit
                },
                total: cleanRows.length,
                data: cleanRows
            });
        } catch (error) {
            console.error('Error fetching nearby mosques:', error);
            return res.status(500).json({
                success: false,
                error: 'নিকটবর্তী মসজিদ অনুসন্ধানে সমস্যা হয়েছে।'
            });
        }
    },

    /**
     * Search mosques by name (Fast Substring Match)
     * GET /api/v1/mosques/search?q=Baitul&limit=50&female_only=1
     */
    async searchMosques(req, res) {
        try {
            const keyword = req.query.q || '';
            const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
            const femaleOnly = req.query.female_only === 'true' || req.query.female_only === '1';

            if (!keyword.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'অনুসন্ধানের জন্য কিওয়ার্ড প্রদান করুন।'
                });
            }

            let query = `
                SELECT id, name, latitude, longitude, has_female_facility
                FROM mosques
                WHERE name LIKE ?
            `;
            const params = [`%${keyword.trim()}%`];

            if (femaleOnly) {
                query += ' AND has_female_facility = 1';
            }

            query += ' ORDER BY id ASC LIMIT ?;';
            params.push(limit);

            const [rows] = await pool.query(query, params);

            const cleanRows = rows.map(r => ({
                id: r.id,
                name: r.name,
                latitude: parseFloat(r.latitude),
                longitude: parseFloat(r.longitude),
                has_female_facility: r.has_female_facility
            }));

            return res.json({
                success: true,
                total: cleanRows.length,
                data: cleanRows
            });
        } catch (error) {
            console.error('Error searching mosques:', error);
            return res.status(500).json({
                success: false,
                error: 'মসজিদ অনুসন্ধানে ত্রুটি হয়েছে।'
            });
        }
    },

    /**
     * Get mosques inside map bounding box (Strictly Zoom-Gated Viewport)
     * Capped at max 150 rows for blazing performance
     * GET /api/v1/mosques/bounds?minLat=24.3&maxLat=24.4&minLng=88.5&maxLng=88.7&limit=150
     */
    async getMosquesInBounds(req, res) {
        try {
            const minLat = parseFloat(req.query.minLat);
            const maxLat = parseFloat(req.query.maxLat);
            const minLng = parseFloat(req.query.minLng);
            const maxLng = parseFloat(req.query.maxLng);
            const limit = Math.min(parseInt(req.query.limit || '150', 10), 200);
            const femaleOnly = req.query.female_only === 'true' || req.query.female_only === '1';

            if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
                return res.status(400).json({
                    success: false,
                    error: 'সঠিক বাউন্ডিং বক্স কোঅর্ডিনেটস প্রয়োজন।'
                });
            }

            // Ensure min <= max
            const realMinLat = Math.min(minLat, maxLat);
            const realMaxLat = Math.max(minLat, maxLat);
            const realMinLng = Math.min(minLng, maxLng);
            const realMaxLng = Math.max(minLng, maxLng);

            let query = `
                SELECT id, name, latitude, longitude, has_female_facility
                FROM mosques
                WHERE latitude BETWEEN ? AND ?
                  AND longitude BETWEEN ? AND ?
            `;
            const params = [realMinLat, realMaxLat, realMinLng, realMaxLng];

            if (femaleOnly) {
                query += ' AND has_female_facility = 1';
            }

            query += ' LIMIT ?;';
            params.push(limit);

            const [rows] = await pool.query(query, params);

            const cleanRows = rows.map(r => ({
                id: r.id,
                name: r.name,
                latitude: parseFloat(r.latitude),
                longitude: parseFloat(r.longitude),
                has_female_facility: r.has_female_facility
            }));

            return res.json({
                success: true,
                total: cleanRows.length,
                data: cleanRows
            });
        } catch (error) {
            console.error('Error fetching mosques in bounds:', error);
            return res.status(500).json({
                success: false,
                error: 'ভিউর্পোটের মসজিদ লোড করতে সমস্যা হয়েছে।'
            });
        }
    },

    /**
     * Add a New Mosque
     * POST /api/v1/mosques
     * Body: { name, latitude, longitude, has_female_facility }
     */
    async createMosque(req, res) {
        try {
            const { name, latitude, longitude, has_female_facility } = req.body;

            if (!name || latitude === undefined || longitude === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'মসজিদের নাম (name), অক্ষাংশ (latitude) এবং দ্রাঘিমাংশ (longitude) বাধ্যতামূলক।'
                });
            }

            const cleanName = String(name).trim();
            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);
            const femaleVal = (has_female_facility === true || has_female_facility === 1 || has_female_facility === '1' || has_female_facility === 'true') ? 1 : 0;

            if (isNaN(lat) || isNaN(lng) || lat < 20 || lat > 27 || lng < 87 || lng > 93) {
                return res.status(400).json({
                    success: false,
                    error: 'সঠিক বাংলাদেশ ভৌগোলিক কোঅর্ডিনেটস প্রদান করুন (Latitude: 20.0-27.0, Longitude: 87.0-93.0)।'
                });
            }

            const query = `
                INSERT INTO mosques (name, latitude, longitude, location, has_female_facility)
                VALUES (?, ?, ?, POINT(?, ?), ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    has_female_facility = VALUES(has_female_facility)
            `;

            const [result] = await pool.query(query, [cleanName, lat, lng, lat, lng, femaleVal]);

            return res.status(201).json({
                success: true,
                message: 'নতুন মসজিদ সফলভাবে যুক্ত হয়েছে!',
                data: {
                    id: result.insertId,
                    name: cleanName,
                    latitude: lat,
                    longitude: lng,
                    has_female_facility: femaleVal
                }
            });

        } catch (error) {
            console.error('Error creating mosque:', error);
            return res.status(500).json({
                success: false,
                error: 'নতুন মসজিদ যুক্ত করতে ব্যর্থ হয়েছে: ' + error.message
            });
        }
    },

    /**
     * Update Mosque Information (Female facility, name)
     * PATCH/PUT /api/v1/mosques/:id
     */
    async updateMosque(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    error: 'অকার্যকর মসজিদ আইডি।'
                });
            }

            const { has_female_facility, name } = req.body;

            if (has_female_facility === undefined && name === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'কমপক্ষে একটি তথ্য প্রদান করুন।'
                });
            }

            const updates = [];
            const params = [];

            if (has_female_facility !== undefined) {
                const femaleVal = (has_female_facility === true || has_female_facility === 1 || has_female_facility === '1' || has_female_facility === 'true') ? 1 : 0;
                updates.push('has_female_facility = ?');
                params.push(femaleVal);
            }

            if (name !== undefined && String(name).trim()) {
                updates.push('name = ?');
                params.push(String(name).trim());
            }

            params.push(id);
            const query = `UPDATE mosques SET ${updates.join(', ')} WHERE id = ?`;

            const [result] = await pool.query(query, params);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: `আইডি ${id} যুক্ত মসজিদটি খুঁজে পাওয়া যায়নি।`
                });
            }

            const [rows] = await pool.query('SELECT id, name, latitude, longitude, has_female_facility, updated_at FROM mosques WHERE id = ?', [id]);

            return res.json({
                success: true,
                message: 'মসজিদের তথ্য সফলভাবে আপডেট হয়েছে।',
                data: {
                    ...rows[0],
                    latitude: parseFloat(rows[0].latitude),
                    longitude: parseFloat(rows[0].longitude)
                }
            });

        } catch (error) {
            console.error('Error updating mosque:', error);
            return res.status(500).json({
                success: false,
                error: 'মসজিদ আপডেট করতে সমস্যা হয়েছে।'
            });
        }
    },

    /**
     * Mosque statistics
     * Fast COUNT(*) queries
     * GET /api/v1/mosques/stats
     */
    async getStats(req, res) {
        try {
            const [totalRows] = await pool.query('SELECT COUNT(*) AS total_mosques FROM mosques');
            const [femaleRows] = await pool.query('SELECT COUNT(*) AS total_female FROM mosques WHERE has_female_facility = 1');

            return res.json({
                success: true,
                total_mosques: totalRows[0].total_mosques,
                female_facility_mosques: femaleRows[0].total_female
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
            return res.status(500).json({
                success: false,
                error: 'পরিসংখ্যান লোড করতে ব্যর্থ হয়েছে।'
            });
        }
    }
};

module.exports = mosqueController;
