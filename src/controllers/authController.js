const crypto = require('crypto');
const pool = require('../config/db');

// In-memory active tokens store: token -> { id, username, role, createdAt }
const activeSessions = new Map();

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt, originalHash] = storedHash.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
}

const authController = {
    /**
     * POST /api/v1/auth/login
     */
    async login(req, res) {
        try {
            const { username, password } = req.body;
            const envUser = process.env.ADMIN_USERNAME || 'admin';
            const envPass = process.env.ADMIN_PASSWORD || 'admin123';

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'ইউজারনেম এবং পাসওয়ার্ড প্রদান করুন।'
                });
            }

            // Check MySQL users table
            let user = null;
            try {
                const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
                if (rows.length > 0) {
                    if (verifyPassword(password, rows[0].password_hash)) {
                        user = rows[0];
                    }
                }
            } catch (dbErr) {
                // Table might not exist yet; will fall back to env
            }

            // Fallback to .env admin credentials if not matched in DB
            if (!user && username.trim() === envUser && password === envPass) {
                user = { id: 1, username: envUser, role: 'admin' };
                // Ensure user is recorded in database
                try {
                    const hashed = hashPassword(envPass);
                    await pool.query('INSERT IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)', [envUser, hashed, 'admin']);
                } catch (e) {}
            }

            if (user) {
                const token = crypto.randomBytes(32).toString('hex');
                activeSessions.set(token, {
                    id: user.id,
                    username: user.username,
                    role: user.role || 'admin',
                    createdAt: Date.now()
                });

                return res.json({
                    success: true,
                    message: 'লগইন সফল হয়েছে!',
                    token,
                    user: { id: user.id, username: user.username, role: user.role || 'admin' }
                });
            } else {
                return res.status(401).json({
                    success: false,
                    error: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!'
                });
            }
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ success: false, error: 'সার্ভার ত্রুটি: লগইন সম্পন্ন করা যায়নি।' });
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
            const session = activeSessions.get(token);
            return res.json({
                success: true,
                authenticated: true,
                user: { id: session.id, username: session.username, role: session.role }
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
     * POST /api/v1/auth/change-password
     * Body: { currentPassword, newPassword }
     */
    async changePassword(req, res) {
        try {
            const session = req.user;
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'বর্তমান পাসওয়ার্ড এবং নতুন পাসওয়ার্ড প্রদান করুন।'
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'
                });
            }

            const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [session.username]);
            if (rows.length === 0 || !verifyPassword(currentPassword, rows[0].password_hash)) {
                return res.status(400).json({
                    success: false,
                    error: 'বর্তমান পাসওয়ার্ডটি সঠিক নয়!'
                });
            }

            const newHashed = hashPassword(newPassword);
            await pool.query('UPDATE users SET password_hash = ? WHERE username = ?', [newHashed, session.username]);

            return res.json({
                success: true,
                message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!'
            });
        } catch (error) {
            console.error('Change password error:', error);
            return res.status(500).json({ success: false, error: 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে।' });
        }
    },

    /**
     * GET /api/v1/auth/users (List all accounts)
     */
    async listUsers(req, res) {
        try {
            const [rows] = await pool.query('SELECT id, username, role, created_at, updated_at FROM users ORDER BY id ASC');
            return res.json({
                success: true,
                data: rows
            });
        } catch (error) {
            console.error('List users error:', error);
            return res.status(500).json({ success: false, error: 'ইউজার তালিকা আনতে ব্যর্থ হয়েছে।' });
        }
    },

    /**
     * POST /api/v1/auth/users (Create new admin or user)
     * Body: { username, password, role }
     */
    async createUser(req, res) {
        try {
            const { username, password, role } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'নতুন ইউজারের নাম এবং পাসওয়ার্ড দিন।'
                });
            }

            const cleanUser = username.trim().toLowerCase();
            if (cleanUser.length < 3) {
                return res.status(400).json({
                    success: false,
                    error: 'ইউজারনেম কমপক্ষে ৩ অক্ষরের হতে হবে।'
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'
                });
            }

            const [exist] = await pool.query('SELECT id FROM users WHERE username = ?', [cleanUser]);
            if (exist.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `এই ইউজারনেম ('${cleanUser}') ইতিমধ্যে বিদ্যমান!`
                });
            }

            const hashed = hashPassword(password);
            const userRole = role === 'admin' ? 'admin' : 'editor';
            const [result] = await pool.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [cleanUser, hashed, userRole]);

            return res.json({
                success: true,
                message: `নতুন অ্যাকাউন্ট '${cleanUser}' সফলভাবে তৈরি হয়েছে!`,
                data: { id: result.insertId, username: cleanUser, role: userRole }
            });
        } catch (error) {
            console.error('Create user error:', error);
            return res.status(500).json({ success: false, error: 'নতুন ইউজার তৈরি ব্যর্থ হয়েছে।' });
        }
    },

    /**
     * DELETE /api/v1/auth/users/:id
     */
    async deleteUser(req, res) {
        try {
            const targetId = parseInt(req.params.id, 10);
            const session = req.user;

            if (session.id === targetId) {
                return res.status(400).json({
                    success: false,
                    error: 'আপনি নিজের অ্যাকাউন্ট নিজে ডিলিট করতে পারবেন না!'
                });
            }

            const [count] = await pool.query('SELECT COUNT(*) as total FROM users');
            if (count[0].total <= 1) {
                return res.status(400).json({
                    success: false,
                    error: 'কমপক্ষে একজন এডমিন থাকা বাধ্যতামূলক!'
                });
            }

            await pool.query('DELETE FROM users WHERE id = ?', [targetId]);

            return res.json({
                success: true,
                message: 'অ্যাকাউন্ট সফলভাবে মুছে ফেলা হয়েছে।'
            });
        } catch (error) {
            console.error('Delete user error:', error);
            return res.status(500).json({ success: false, error: 'ইউজার ডিলিট করা যায়নি।' });
        }
    },

    /**
     * Auth Middleware
     */
    requireAuth(req, res, next) {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.split(' ')[1] 
            : req.query.token;

        if (token && activeSessions.has(token)) {
            req.user = activeSessions.get(token);
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
