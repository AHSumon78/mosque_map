const { execFile } = require('child_process');
const path = require('path');
const pool = require('../config/db');

// Mutex queue to prevent launching multiple headless browsers concurrently (protects server RAM)
let verificationLock = Promise.resolve();

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Checks if a mosque already exists in 'mosques' or 'pending_mosques' within radiusMeters (default 15m)
 */
async function checkLocalDuplicate(lat, lng, radiusMeters = 15) {
    // 1. Check main approved mosques table
    const [existing] = await pool.query(
        `SELECT id, name, ROUND(ST_Distance_Sphere(POINT(longitude, latitude), POINT(?, ?))) AS dist
         FROM mosques
         WHERE ST_Distance_Sphere(POINT(longitude, latitude), POINT(?, ?)) <= ?
         ORDER BY dist ASC LIMIT 1`,
        [lng, lat, lng, lat, radiusMeters]
    );

    if (existing.length > 0) {
        return {
            duplicate: true,
            source: 'mosques',
            id: existing[0].id,
            name: existing[0].name,
            distance: parseInt(existing[0].dist, 10)
        };
    }

    // 2. Check pending_mosques table
    const [pending] = await pool.query(
        `SELECT id, name, ROUND(ST_Distance_Sphere(POINT(longitude, latitude), POINT(?, ?))) AS dist
         FROM pending_mosques
         WHERE status = 'pending'
           AND ST_Distance_Sphere(POINT(longitude, latitude), POINT(?, ?)) <= ?
         ORDER BY dist ASC LIMIT 1`,
        [lng, lat, lng, lat, radiusMeters]
    );

    if (pending.length > 0) {
        return {
            duplicate: true,
            source: 'pending_mosques',
            id: pending[0].id,
            name: pending[0].name,
            distance: parseInt(pending[0].dist, 10)
        };
    }

    return { duplicate: false };
}

/**
 * Execute Playwright Google Maps verification script with timeout and fallback
 */
function runGoogleMapsVerifier(lat, lng, maxRadiusMeters = 20) {
    const scriptPath = path.join(__dirname, '../../scripts/verify_gmaps.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    return new Promise((resolve) => {
        execFile(pythonCmd, [scriptPath, String(lat), String(lng), String(maxRadiusMeters)], { timeout: 12000 }, (err, stdout) => {
            if (err) {
                return resolve({ success: false, error: err.message });
            }
            try {
                const parsed = JSON.parse(stdout.trim());
                resolve(parsed);
            } catch (parseErr) {
                resolve({ success: false, error: 'Invalid script output' });
            }
        });
    });
}

/**
 * Fallback free OSM Photon verification (zero browser needed)
 */
async function checkPhotonFallback(lat, lng, maxRadiusMeters = 20) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const url = `https://photon.komoot.io/api/?q=mosque&lat=${lat}&lon=${lng}&limit=5`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'MosqueMapBD/1.0' },
            signal: controller.signal
        });
        clearTimeout(timer);

        if (!res.ok) return { verified: false };
        const data = await res.json();
        const features = data.features || [];

        let closestDist = null;
        let closestName = null;
        for (const f of features) {
            const coords = f.geometry?.coordinates;
            if (!coords || coords.length < 2) continue;
            const dist = haversineMeters(lat, lng, coords[1], coords[0]);
            if (closestDist === null || dist < closestDist) {
                closestDist = dist;
                closestName = f.properties?.name || 'OSM Mosque';
            }
            if (dist <= maxRadiusMeters) {
                return {
                    verified: true,
                    source: 'OpenStreetMap',
                    matchedName: f.properties?.name || 'Mosque',
                    distance: Math.round(dist)
                };
            }
        }
        return {
            verified: false,
            closestName,
            distance: closestDist !== null ? Math.round(closestDist) : null
        };
    } catch (e) {
        return { verified: false };
    }
}

/**
 * Serialized Free 10-20m Map Verification
 */
async function verifyWithGoogleMapsFree(lat, lng, maxRadiusMeters = 20) {
    const task = verificationLock.then(async () => {
        // 1. Primary: Google Maps Direct Verification
        const gmapRes = await runGoogleMapsVerifier(lat, lng, maxRadiusMeters);
        if (gmapRes && gmapRes.success) {
            if (gmapRes.verified) {
                return {
                    verified: true,
                    source: 'Google Maps',
                    matchedName: gmapRes.closest_name,
                    distance: gmapRes.distance_meters,
                    note: `Google Maps-এ ${gmapRes.distance_meters} মিটারের মধ্যে '${gmapRes.closest_name}' পাওয়া গেছে (Auto-Approved)`
                };
            } else {
                const distText = gmapRes.distance_meters !== null ? `${gmapRes.distance_meters} মিটার দূরে '${gmapRes.closest_name}'` : 'কোনো মসজিদ পাওয়া যায়নি';
                return {
                    verified: false,
                    matchedName: gmapRes.closest_name,
                    distance: gmapRes.distance_meters,
                    note: `Google Maps-এ ২০ মিটারের মধ্যে পাওয়া যায়নি (নিকটতম: ${distText})`
                };
            }
        }

        // 2. Backup: OpenStreetMap Photon Fallback (if Playwright/Chromium is unavailable)
        const osmRes = await checkPhotonFallback(lat, lng, maxRadiusMeters);
        if (osmRes.verified) {
            return {
                verified: true,
                source: 'OpenStreetMap',
                matchedName: osmRes.matchedName,
                distance: osmRes.distance,
                note: `OpenStreetMap-এ ${osmRes.distance} মিটারের মধ্যে '${osmRes.matchedName}' পাওয়া গেছে (Auto-Approved)`
            };
        }

        return {
            verified: false,
            note: 'অটো-ভেরিফিকেশন নিশ্চিত হয়নি; এডমিন রিভিউয়ের জন্য জমা দেওয়া হয়েছে'
        };
    });

    // Advance mutex cleanly regardless of error
    verificationLock = task.catch(() => {});
    return task;
}

module.exports = {
    haversineMeters,
    checkLocalDuplicate,
    verifyWithGoogleMapsFree
};

