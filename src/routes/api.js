const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const mosqueController = require('../controllers/mosqueController');
const importController = require('../controllers/importController');

const router = express.Router();

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup for CSV file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'import-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only .csv files are supported.'));
        }
    }
});

// Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        service: 'Bangladesh Mosque Map & Nearby API'
    });
});

// Mosque Query Routes
router.get('/mosques/nearby', mosqueController.getNearbyMosques);
router.get('/mosques/search', mosqueController.searchMosques);
router.get('/mosques/bounds', mosqueController.getMosquesInBounds);
router.get('/mosques/stats', mosqueController.getStats);

// Mosque Update Routes (Update name, female facility, etc.)
router.put('/mosques/:id', mosqueController.updateMosque);
router.patch('/mosques/:id', mosqueController.updateMosque);

// CSV Import Route
router.post('/mosques/import', upload.single('file'), importController.importCSV);

module.exports = router;
