const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 7080;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Mount API
app.use('/api/v1', apiRoutes);

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

// Start Server
app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`🕌 Bangladesh Mosque Map & API Service`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Web UI: http://localhost:${PORT}`);
    console.log(`📡 API Endpoints: http://localhost:${PORT}/api/v1/health`);
    console.log('====================================================');
});
