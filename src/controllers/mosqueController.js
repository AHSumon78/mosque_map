const pool = require('../config/db');

/**
 * Controller for Mosque queries, updates, and spatial calculations
 */
const mosqueController = {
    /**
     * Get nearby mosques using MySQL Spatial ST_Distance_Sphere
     * Supports filtering by female prayer facilities
     * GET /api/v1/mosques/nearby?lat=23.7258&lng=90.4127&radius=2000&limit=100&female_only=1
     */
    async getNearbyMosques(req, res) {
        try {
            const lat = parseFloat(req.query.lat);
            const lng = parseFloat(req.query.lng);
            const radius = Math.min(parseInt(req.query.radius || '2000', 10), 50000); // max 50km
            const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
            const femaleOnly = req.query.female_only === 'true' || req.query.female_only === '1';

            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid lat (latitude) and lng (longitude) parameters are required.'
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

            return res.json({
                success: true,
                query: {
                    latitude: lat,
                    longitude: lng,
                    radius_meters: radius,
                    female_only: femaleOnly,
                    limit: limit
                },
                total: rows.length,
                data: rows
            });
        } catch (error) {
            console.error('Error fetching nearby mosques:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error while searching nearby mosques.'
            });
        }
    },

    /**
     * Search mosques by name
     * GET /api/v1/mosques/search?q=Baitul&limit=30&female_only=1
     */
    async searchMosques(req, res) {
        try {
            const keyword = req.query.q || '';
            const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
            const femaleOnly = req.query.female_only === 'true' || req.query.female_only === '1';

            if (!keyword.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'Query parameter q is required.'
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

            query += ' LIMIT ?;';
            params.push(limit);

            const [rows] = await pool.query(query, params);

            return res.json({
                success: true,
                total: rows.length,
                data: rows
            });
        } catch (error) {
            console.error('Error searching mosques:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error while searching mosques.'
            });
        }
    },

    /**
     * Get mosques inside map bounding box
     * GET /api/v1/mosques/bounds?minLat=23.7&maxLat=23.8&minLng=90.3&maxLng=90.5&limit=200&female_only=1
     */
    async getMosquesInBounds(req, res) {
        try {
            const minLat = parseFloat(req.query.minLat);
            const maxLat = parseFloat(req.query.maxLat);
            const minLng = parseFloat(req.query.minLng);
            const maxLng = parseFloat(req.query.maxLng);
            const limit = Math.min(parseInt(req.query.limit || '300', 10), 1000);
            const femaleOnly = req.query.female_only === 'true' || req.query.female_only === '1';

            if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
                return res.status(400).json({
                    success: false,
                    error: 'minLat, maxLat, minLng, maxLng parameters are required.'
                });
            }

            let query = `
                SELECT id, name, latitude, longitude, has_female_facility
                FROM mosques
                WHERE latitude BETWEEN ? AND ?
                  AND longitude BETWEEN ? AND ?
            `;
            const params = [minLat, maxLat, minLng, maxLng];

            if (femaleOnly) {
                query += ' AND has_female_facility = 1';
            }

            query += ' LIMIT ?;';
            params.push(limit);

            const [rows] = await pool.query(query, params);

            return res.json({
                success: true,
                total: rows.length,
                data: rows
            });
        } catch (error) {
            console.error('Error fetching mosques in bounds:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error while fetching viewport mosques.'
            });
        }
    },

    /**
     * Update Mosque Information (e.g. Female prayer facilities, name)
     * PUT/PATCH /api/v1/mosques/:id
     * Body: { has_female_facility: true|false|1|0, name: "optional new name" }
     */
    async updateMosque(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid mosque ID.'
                });
            }

            const { has_female_facility, name } = req.body;

            if (has_female_facility === undefined && name === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'At least one field (has_female_facility or name) must be provided.'
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
                    error: `Mosque with ID ${id} not found.`
                });
            }

            // Fetch updated record
            const [rows] = await pool.query('SELECT id, name, latitude, longitude, has_female_facility, updated_at FROM mosques WHERE id = ?', [id]);

            return res.json({
                success: true,
                message: 'Mosque updated successfully.',
                data: rows[0]
            });

        } catch (error) {
            console.error('Error updating mosque:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error while updating mosque.'
            });
        }
    },

    /**
     * Mosque statistics (total and female-friendly count)
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
                error: 'Internal server error.'
            });
        }
    }
};

module.exports = mosqueController;
