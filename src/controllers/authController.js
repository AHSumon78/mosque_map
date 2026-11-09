const crypto = require('crypto');

// In-memory active tokens store (simple, robust, no extra heavy dependencies needed)
const activeSessions = new Set();

const authController = {
    /**
     * POST /api/v1/auth/login
     * Body: { username, password }
     */
    login(req, res) {
        const { username, password } = req.body;
        const adminUser = process.env.ADMIN_USERNAME || 'admin';
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'ইউজারনেম এবং পাসওয়ার্ড প্রদান করুন।'
            });
        }

        if (username === adminUser && password === adminPass) {
            // Generate secure random session token
            const token = crypto.randomBytes(32).toString('hex');
            activeSessions.add(token);

            return res.json({
                success: true,
                message: 'লগইন সফল হয়েছে!',
                token,
                user: { username: adminUser }
            });
        } else {
            return res.status(401).json({
                success: false,
                error: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!'
            });
        }
    },

    /**
     * GET /api/v1/auth/verify
     */
    verify(req, res) {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.split(' ')[1] 
            : req.query.token;

        if (token && activeSessions.has(token)) {
            return res.json({
                success: true,
                authenticated: true,
                user: { username: process.env.ADMIN_USERNAME || 'admin' }
            });
        } else {
            return res.status(401).json({
                success: false,
                authenticated: false,
                error: 'অননুমোদিত বা মেয়াদোত্তীর্ণ সেশন।'
            });
        }
    },

    /**
     * POST /api/v1/auth/logout
     */
    logout(req, res) {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.split(' ')[1] 
            : req.body.token;

        if (token) {
            activeSessions.delete(token);
        }

        return res.json({
            success: true,
            message: 'সফলভাবে লগআউট হয়েছে।'
        });
    },

    /**
     * Auth Middleware for protecting sensitive routes
     */
    requireAuth(req, res, next) {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.split(' ')[1] 
            : req.query.token;

        if (token && activeSessions.has(token)) {
            next();
        } else {
            return res.status(401).json({
                success: false,
                error: 'অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে লগইন করুন।'
            });
        }
    }
};

module.exports = authController;
