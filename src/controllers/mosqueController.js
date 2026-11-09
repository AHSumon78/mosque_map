const pool = require('../config/db');

/**
 * Controller for Mosque queries and spatial calculations
 */
const mosqueController = {
    /**
     * Get nearby mosques using MySQL Spatial ST_Distance_Sphere
     * GET /api/v1/mosques/nearby?lat=23.7258&lng=90.4127&radius=2000&limit=100
     */
    async getNearbyMosques(req, res) {
        try {
            const lat = parseFloat(req.query.lat);
            const lng = parseFloat(req.query.lng);
            const radius = Math.min(parseInt(req.query.radius || '2000', 10), 50000); // max 50km
            const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);

            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid lat (latitude) and lng (longitude) parameters are required.'
                });
            }

            const query = `
                SELECT 
                    id,
                    name,
                    latitude,
                    longitude,
                    ROUND(ST_Distance_Sphere(POINT(longitude, latitude), POINT(?, ?))) AS distance_meters
                FROM mosques
                WHERE ST_Distance_Sphere(POINT(longitude, latitude), POINT(?, ?)) <= ?
                ORDER BY distance_meters ASC
                LIMIT ?;
            `;

            const [rows] = await pool.query(query, [lng, lat, lng, lat, radius, limit]);

            return res.json({
                success: true,
                query: {
                    latitude: lat,
                    longitude: lng,
                    radius_meters: radius,
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
     * GET /api/v1/mosques/search?q=Baitul&limit=30
     */
    async searchMosques(req, res) {
        try {
            const keyword = req.query.q || '';
            const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);

            if (!keyword.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'Query parameter q is required.'
                });
            }

            const query = `
                SELECT id, name, latitude, longitude
                FROM mosques
                WHERE name LIKE ?
                LIMIT ?;
            `;

            const [rows] = await pool.query(query, [`%${keyword.trim()}%`, limit]);

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
     * GET /api/v1/mosques/bounds?minLat=23.7&maxLat=23.8&minLng=90.3&maxLng=90.5&limit=200
     */
    async getMosquesInBounds(req, res) {
        try {
            const minLat = parseFloat(req.query.minLat);
            const maxLat = parseFloat(req.query.maxLat);
            const minLng = parseFloat(req.query.minLng);
            const maxLng = parseFloat(req.query.maxLng);
            const limit = Math.min(parseInt(req.query.limit || '300', 10), 1000);

            if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
                return res.status(400).json({
                    success: false,
                    error: 'minLat, maxLat, minLng, maxLng parameters are required.'
                });
            }

            const query = `
                SELECT id, name, latitude, longitude
                FROM mosques
                WHERE latitude BETWEEN ? AND ?
                  AND longitude BETWEEN ? AND ?
                LIMIT ?;
            `;

            const [rows] = await pool.query(query, [minLat, maxLat, minLng, maxLng, limit]);

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
     * Mosque statistics
     * GET /api/v1/mosques/stats
     */
    async getStats(req, res) {
        try {
            const [rows] = await pool.query('SELECT COUNT(*) AS total_mosques FROM mosques');
            return res.json({
                success: true,
                total_mosques: rows[0].total_mosques
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
