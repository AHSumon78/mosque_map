const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 7080;
const HOST = process.env.HOST || '127.0.0.1'; // Bind to localhost for security behind reverse proxy

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

// Start Server strictly on localhost
app.listen(PORT, HOST, () => {
    console.log('====================================================');
    console.log(`🕌 Bangladesh Mosque Map & API Service`);
    console.log(`🚀 Server bound securely to: http://${HOST}:${PORT}`);
    console.log(`🌐 Public Access via Nginx HTTPS reverse proxy`);
    console.log('====================================================');
});
