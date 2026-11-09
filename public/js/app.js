/**
 * Bangladesh Mosque Map - Frontend Application
 * Designed for 100,000+ Mosques with Google Maps-style Zoom-Gated Viewports,
 * Instant Debounced Search, Radius Nearby, Female Facility Tracking, and Admin Account Management.
 */

// Compute Dynamic API Base URL
const currentPath = window.location.pathname.replace(/\/+$/, '');
const API_BASE = (currentPath ? currentPath : '') + '/api/v1';

// Global Constants & State
const ZOOM_THRESHOLD = 13; // Mosques only render at Zoom >= 13 for optimal performance
let map = null;
let markerCluster = null;
let currentCircle = null;
let userPinMarker = null;
let activePopupMarker = null;
let currentCenter = { lat: 24.3636, lng: 88.6241 }; // Default centered near Bangladesh / Rajshahi
let selectedFile = null;
let authToken = localStorage.getItem('mosque_token');
let searchTimeout = null;
let moveTimeout = null;
let markersMap = new Map(); // id -> leaflet marker

// Custom Marker Icons
const mosqueIcon = L.divIcon({
    html: '<div style="background-color: #059669; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3); border: 2px solid white;"><i class="fa-solid fa-mosque" style="font-size: 13px;"></i></div>',
    className: 'custom-mosque-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
});

const femaleMosqueIcon = L.divIcon({
    html: '<div style="background-color: #db2777; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 6px rgba(219,39,119,0.4); border: 2px solid white;"><i class="fa-solid fa-person-dress" style="font-size: 15px;"></i></div>',
    className: 'custom-female-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
});

const userLocationIcon = L.divIcon({
    html: '<div style="background-color: #2563eb; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(0,0,0,0.4); border: 2px solid white;"><i class="fa-solid fa-person-praying" style="font-size: 15px;"></i></div>',
    className: 'custom-user-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    setupAuthListeners();
    checkAuthAndInit();
});

// ==========================================
// 1. Authentication Handling
// ==========================================
async function checkAuthAndInit() {
    authToken = localStorage.getItem('mosque_token');
    const savedUser = localStorage.getItem('mosque_username') || 'Admin';

    if (!authToken) {
        showLoginScreen();
        return;
    }

    // Instantly show the app screen (No reload flicker, zero latency)
    showAppScreen(savedUser);

    // Verify token with backend in background
    try {
        const res = await fetch(`${API_BASE}/auth/verify`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.success && data.authenticated) {
            const confirmedUser = data.user?.username || savedUser;
            document.getElementById('loggedInUser').innerText = confirmedUser;
            localStorage.setItem('mosque_username', confirmedUser);
        } else {
            // Token is revoked or invalid
            localStorage.removeItem('mosque_token');
            localStorage.removeItem('mosque_username');
            showLoginScreen();
        }
    } catch (err) {
        // If server is temporarily restarting or network blip, keep user on map!
        console.warn('Auth verify network notice:', err.message);
    }
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
}

function showAppScreen(username) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    document.getElementById('loggedInUser').innerText = username;

    if (!map) {
        initMap();
        fetchStats();
        setupEventListeners();
        setupAdminModalListeners();
    } else {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

function setupAuthListeners() {
    const loginForm = document.getElementById('loginForm');
    const loginErrorMsg = document.getElementById('loginErrorMsg');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginErrorMsg.style.display = 'none';
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> যাচাই হচ্ছে...';

        const username = document.getElementById('usernameInput').value.trim();
        const password = document.getElementById('passwordInput').value;

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> লগইন করুন';

            if (data.success && data.token) {
                localStorage.setItem('mosque_token', data.token);
                localStorage.setItem('mosque_username', data.user?.username || username);
                showAppScreen(data.user?.username || username);
            } else {
                loginErrorMsg.innerText = data.error || 'ভুল ইউজারনেম বা পাসওয়ার্ড!';
                loginErrorMsg.style.display = 'block';
            }
        } catch (err) {
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> লগইন করুন';
            loginErrorMsg.innerText = 'সার্ভারের সাথে সংযোগ করা যায়নি।';
            loginErrorMsg.style.display = 'block';
        }
    });

    logoutBtn.addEventListener('click', async () => {
        if (!confirm('আপনি কি নিশ্চিত লগআউট করতে চান?')) return;
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('mosque_token')}`
                }
            });
        } catch (err) {}

        localStorage.removeItem('mosque_token');
        localStorage.removeItem('mosque_username');
        window.location.reload();
    });
}

// ==========================================
// 2. Map Initialization & Zoom-Gating Engine
// ==========================================
function initMap() {
    // Initial Zoom set to country overview (zoom 8)
    map = L.map('map', {
        center: [currentCenter.lat, currentCenter.lng],
        zoom: 8,
        zoomControl: true
    });

    // OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Marker Cluster Group (with safe fallback)
    if (typeof L.markerClusterGroup === 'function') {
        markerCluster = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 45,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false
        });
    } else {
        console.warn('MarkerCluster not loaded, falling back to L.featureGroup');
        markerCluster = L.featureGroup();
    }
    map.addLayer(markerCluster);

    // Initial check of zoom gate
    updateZoomGate();

    // Map Click: Search nearby at that point
    map.on('click', (e) => {
        searchNearbyAt(e.latlng.lat, e.latlng.lng);
    });

    // Zoom/Move End listener: Triggers Viewport Mosques only when Zoom >= 13
    map.on('moveend zoomend', () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => {
            handleMapMoveOrZoom();
        }, 300);
    });

    setTimeout(() => map.invalidateSize(), 300);
}

// Update Zoom Gate (Show/Hide Zoom Hint & Manage Empty State)
function updateZoomGate() {
    const zoom = map.getZoom();
    const zoomHint = document.getElementById('zoomHint');
    const searchVal = document.getElementById('searchInput').value.trim();

    if (zoom < ZOOM_THRESHOLD) {
        // Zoom is too low (< 13): Gate active
        if (!searchVal && !userPinMarker) {
            zoomHint.classList.add('show');
            markerCluster.clearLayers();
            markersMap.clear();
            showZoomPromptInSidebar();
        } else {
            zoomHint.classList.remove('show');
        }
    } else {
        // Zoom is high enough (>= 13)
        zoomHint.classList.remove('show');
    }
}

// Handle Map Move / Zoom Change
function handleMapMoveOrZoom() {
    const searchVal = document.getElementById('searchInput').value.trim();
    const zoom = map.getZoom();

    updateZoomGate();

    // If currently searching or focused on a custom user pin, don't override with viewport query
    if (searchVal) return;
    if (userPinMarker) return;

    if (zoom >= ZOOM_THRESHOLD) {
        loadViewportMosques();
    }
}

// Show Zoom In Prompt in Sidebar
function showZoomPromptInSidebar() {
    const resultsList = document.getElementById('resultsList');
    const searchStatus = document.getElementById('searchStatus');
    const resultsCount = document.getElementById('resultsCount');

    resultsCount.innerText = 'মসজিদ তালিকা';
    searchStatus.innerText = 'জুম করুন';

    resultsList.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-magnifying-glass-plus empty-icon"></i>
            <p><b>মসজিদ দেখতে ম্যাপে জুম ইন করুন</b></p>
            <p style="font-size: 0.8rem; margin-top: 6px; line-height: 1.4;">
                Zoom স্তর ১৩ বা তার বেশি হলে এই এলাকার মসজিদগুলো সরাসরি প্রদর্শিত হবে। অথবা উপরে মসজিদের নাম লিখে অনুসন্ধান করুন।
            </p>
        </div>
    `;
}

// ==========================================
// 3. Viewport Mosques Query (Zoom >= 13)
// ==========================================
async function loadViewportMosques() {
    if (map.getZoom() < ZOOM_THRESHOLD) {
        updateZoomGate();
        return;
    }

    try {
        const bounds = map.getBounds();
        const minLat = bounds.getSouth();
        const maxLat = bounds.getNorth();
        const minLng = bounds.getWest();
        const maxLng = bounds.getEast();

        const femaleOnly = document.getElementById('femaleOnlyToggle').checked;
        const femaleParam = femaleOnly ? '&female_only=1' : '';

        const searchStatus = document.getElementById('searchStatus');
        searchStatus.innerText = 'লোড হচ্ছে...';

        const res = await fetch(`${API_BASE}/mosques/bounds?minLat=${minLat}&maxLat=${maxLat}&minLng=${minLng}&maxLng=${maxLng}&limit=150${femaleParam}`);
        const json = await res.json();

        if (json.success && json.data) {
            renderMapMarkers(json.data);
            renderMosqueResults(json.data);
            searchStatus.innerText = `${json.data.length} টি দৃশ্যমান`;
            document.getElementById('resultsCount').innerText = `দৃশ্যমান মসজিদ (${json.data.length})`;
        } else {
            searchStatus.innerText = '০ টি';
        }
    } catch (e) {
        console.error('Error fetching viewport mosques:', e);
    }
}

// ==========================================
// 4. Name Search Handling (Debounced)
// ==========================================
function setupSearchHandler() {
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (query) {
            clearSearchBtn.style.display = 'block';
        } else {
            clearSearchBtn.style.display = 'none';
            resetSearchView();
            return;
        }

        searchTimeout = setTimeout(async () => {
            await executeSearch(query);
        }, 250);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        resetSearchView();
        searchInput.focus();
    });
}

function resetSearchView() {
    if (userPinMarker) {
        map.removeLayer(userPinMarker);
        userPinMarker = null;
    }
    if (currentCircle) {
        map.removeLayer(currentCircle);
        currentCircle = null;
    }

    if (map.getZoom() >= ZOOM_THRESHOLD) {
        loadViewportMosques();
    } else {
        updateZoomGate();
    }
}

async function executeSearch(query) {
    const resultsList = document.getElementById('resultsList');
    const searchStatus = document.getElementById('searchStatus');
    const resultsCount = document.getElementById('resultsCount');
    const femaleOnly = document.getElementById('femaleOnlyToggle').checked;

    searchStatus.innerText = 'অনুসন্ধান হচ্ছে...';
    resultsCount.innerText = 'অনুসন্ধান ফলাফল';
    resultsList.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';

    // Hide zoom hint during search
    document.getElementById('zoomHint').classList.remove('show');

    try {
        const femaleParam = femaleOnly ? '&female_only=1' : '';
        const res = await fetch(`${API_BASE}/mosques/search?q=${encodeURIComponent(query)}&limit=50${femaleParam}`);
        const json = await res.json();

        if (!json.success || !json.data || json.data.length === 0) {
            searchStatus.innerText = '০ টি পাওয়া গেছে';
            markerCluster.clearLayers();
            markersMap.clear();
            resultsList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-circle-exclamation empty-icon"></i>
                    <p><b>"${query}" নামে কোনো মসজিদ খুঁজে পাওয়া যায়নি</b></p>
                    <p style="font-size: 0.8rem; margin-top: 6px;">সঠিক বানান নিশ্চিত করুন অথবা অন্য কোনো কিওয়ার্ড দিয়ে খুঁজুন।</p>
                </div>
            `;
            return;
        }

        searchStatus.innerText = `${json.data.length} টি পাওয়া গেছে`;
        renderMosqueResults(json.data);
        renderMapMarkers(json.data);

        // Fly directly to the first matched mosque and open popup
        const first = json.data[0];
        const firstLat = parseFloat(first.latitude);
        const firstLng = parseFloat(first.longitude);

        if (!isNaN(firstLat) && !isNaN(firstLng)) {
            map.flyTo([firstLat, firstLng], 16, { duration: 1 });
            setTimeout(() => {
                const marker = markersMap.get(first.id);
                if (marker) marker.openPopup();
            }, 800);
        }

    } catch (err) {
        searchStatus.innerText = 'ত্রুটি';
        resultsList.innerHTML = '<div style="color:red; text-align:center; padding:20px;">অনুসন্ধানে সমস্যা হয়েছে।</div>';
    }
}

// ==========================================
// 5. Search Nearby At Coordinate
// ==========================================
async function searchNearbyAt(lat, lng) {
    currentCenter = { lat: parseFloat(lat), lng: parseFloat(lng) };
    const radius = parseInt(document.getElementById('radiusSelect').value, 10);
    const femaleOnly = document.getElementById('femaleOnlyToggle').checked;
    const resultsList = document.getElementById('resultsList');
    const searchStatus = document.getElementById('searchStatus');
    const resultsCount = document.getElementById('resultsCount');

    searchStatus.innerText = 'অনুসন্ধান হচ্ছে...';
    resultsCount.innerText = 'আশেপাশের মসজিদ';
    resultsList.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';

    // Hide zoom hint
    document.getElementById('zoomHint').classList.remove('show');

    // Update Center Pin
    if (userPinMarker) map.removeLayer(userPinMarker);
    userPinMarker = L.marker([currentCenter.lat, currentCenter.lng], { icon: userLocationIcon }).addTo(map);
    userPinMarker.bindPopup('<b>অনুসন্ধান কেন্দ্রবিন্দু</b>').openPopup();

    // Update Radius Circle
    if (currentCircle) map.removeLayer(currentCircle);
    currentCircle = L.circle([currentCenter.lat, currentCenter.lng], {
        radius: radius,
        color: femaleOnly ? '#db2777' : '#059669',
        fillColor: femaleOnly ? '#f472b6' : '#10b981',
        fillOpacity: 0.12,
        weight: 1.5
    }).addTo(map);

    try {
        const femaleParam = femaleOnly ? '&female_only=1' : '';
        const res = await fetch(`${API_BASE}/mosques/nearby?lat=${currentCenter.lat}&lng=${currentCenter.lng}&radius=${radius}&limit=150${femaleParam}`);
        const json = await res.json();

        if (!json.success || !json.data || json.data.length === 0) {
            searchStatus.innerText = '০ টি পাওয়া গেছে';
            markerCluster.clearLayers();
            markersMap.clear();
            resultsList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-location-dot empty-icon"></i>
                    <p>এই ${radius >= 1000 ? (radius / 1000) + ' কিমি' : radius + ' মিটার'} পরিধির মধ্যে ${femaleOnly ? 'মহিলাদের ব্যবস্থাযুক্ত ' : ''}কোনো মসজিদ পাওয়া যায়নি।</p>
                    <p style="font-size: 0.8rem; margin-top: 6px;">পরিধি বাড়িয়ে দেখুন অথবা ফিল্টার বন্ধ করুন।</p>
                </div>
            `;
            return;
        }

        searchStatus.innerText = `${json.data.length} টি পাওয়া গেছে`;
        renderMosqueResults(json.data);
        renderMapMarkers(json.data);

        map.fitBounds(currentCircle.getBounds(), { maxZoom: 16 });

    } catch (err) {
        searchStatus.innerText = 'ত্রুটি';
        resultsList.innerHTML = `<div style="color:red; text-align:center; padding:20px;">ডাটা লোড করতে সমস্যা হয়েছে।</div>`;
    }
}

// ==========================================
// 6. Render Sidebar Mosque Results
// ==========================================
function renderMosqueResults(mosques) {
    const list = document.getElementById('resultsList');
    list.innerHTML = '';

    if (!mosques || mosques.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">কোনো মসজিদ পাওয়া যায়নি।</div>';
        return;
    }

    mosques.forEach((m) => {
        const lat = parseFloat(m.latitude);
        const lng = parseFloat(m.longitude);

        const card = document.createElement('div');
        card.className = 'mosque-card';
        card.id = `card-${m.id}`;

        const distText = m.distance_meters !== undefined 
            ? (m.distance_meters >= 1000 ? (m.distance_meters / 1000).toFixed(1) + ' km' : m.distance_meters + ' m') 
            : '';

        const hasFemale = m.has_female_facility === 1 || m.has_female_facility === true;
        const femaleTagHtml = hasFemale 
            ? `<span class="female-tag available"><i class="fa-solid fa-person-dress"></i> মহিলাদের ব্যবস্থা আছে</span>`
            : `<span class="female-tag unavailable"><i class="fa-solid fa-minus"></i> মহিলাদের ব্যবস্থা নেই</span>`;

        card.innerHTML = `
            <h4><i class="fa-solid fa-mosque" style="color: ${hasFemale ? '#db2777' : 'var(--primary)'}; margin-right: 6px;"></i>${m.name}</h4>
            <div class="mosque-meta">
                <span><i class="fa-solid fa-location-dot"></i> ${isNaN(lat) ? '' : lat.toFixed(5)}, ${isNaN(lng) ? '' : lng.toFixed(5)}</span>
                ${distText ? `<span class="distance-tag">${distText} দূরে</span>` : ''}
            </div>
            <div style="margin-bottom: 8px;">
                ${femaleTagHtml}
            </div>
            <div style="display: flex; gap: 8px;">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" class="btn btn-outline btn-sm">
                    <i class="fa-solid fa-diamond-turn-right"></i> নেভিগেশন
                </a>
                <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); toggleFemaleFacility(${m.id}, ${hasFemale ? 1 : 0})">
                    <i class="fa-solid fa-pen-to-square"></i> ${hasFemale ? 'ব্যবস্থা সরান' : 'ব্যবস্থা যুক্ত করুন'}
                </button>
            </div>
        `;

        card.addEventListener('click', () => {
            document.querySelectorAll('.mosque-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            map.flyTo([lat, lng], 17);

            const marker = markersMap.get(m.id);
            if (marker) {
                setTimeout(() => marker.openPopup(), 400);
            }
        });

        list.appendChild(card);
    });
}

// ==========================================
// 7. Render Markers on Leaflet Map
// ==========================================
function renderMapMarkers(mosques) {
    markerCluster.clearLayers();
    markersMap.clear();

    if (!mosques) return;

    mosques.forEach(m => {
        const lat = parseFloat(m.latitude);
        const lng = parseFloat(m.longitude);

        if (isNaN(lat) || isNaN(lng)) return;

        const hasFemale = m.has_female_facility === 1 || m.has_female_facility === true;
        const marker = L.marker([lat, lng], { 
            icon: hasFemale ? femaleMosqueIcon : mosqueIcon 
        });

        const distInfo = m.distance_meters !== undefined 
            ? `<div style="font-size:0.8rem; color:#0369a1; margin-bottom:4px;"><b>দূরত্ব:</b> ${m.distance_meters >= 1000 ? (m.distance_meters/1000).toFixed(2) + ' কিমি' : m.distance_meters + ' মিটার'}</div>` 
            : '';

        const femaleBadge = hasFemale
            ? `<div style="margin-bottom:6px;"><span style="background:#fce7f3; color:#be185d; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:600;"><i class="fa-solid fa-person-dress"></i> মহিলাদের নামাজের ব্যবস্থা আছে</span></div>`
            : `<div style="margin-bottom:6px;"><span style="background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:10px; font-size:0.75rem;"><i class="fa-solid fa-minus"></i> মহিলাদের ব্যবস্থা নেই</span></div>`;

        marker.bindPopup(`
            <div style="font-family: inherit; min-width: 180px;">
                <h3 style="margin: 0 0 4px 0; font-size: 0.95rem; color: ${hasFemale ? '#db2777' : '#059669'};">${m.name}</h3>
                ${distInfo}
                ${femaleBadge}
                <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 8px;">
                    📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}
                </div>
                <div style="display:flex; gap:6px;">
                    <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" style="display:inline-block; background:#059669; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.75rem; font-weight:500;">
                        গুগল ম্যাপ
                    </a>
                    <button onclick="toggleFemaleFacility(${m.id}, ${hasFemale ? 1 : 0})" style="background:#db2777; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">
                        ${hasFemale ? 'ব্যবস্থা বাদ দিন' : 'মহিলাদের ব্যবস্থা আছে'}
                    </button>
                </div>
            </div>
        `);

        marker.on('click', () => {
            const card = document.getElementById(`card-${m.id}`);
            if (card) {
                document.querySelectorAll('.mosque-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        markerCluster.addLayer(marker);
        markersMap.set(m.id, marker);
    });
}

// ==========================================
// 8. Toggle Female Facility via API
// ==========================================
async function toggleFemaleFacility(id, currentStatus) {
    const newStatus = currentStatus === 1 ? false : true;
    const confirmMsg = newStatus 
        ? "আপনি কি নিশ্চিত এই মসজিদে মহিলাদের নামাজের ব্যবস্থা আছে?" 
        : "আপনি কি নিশ্চিত এই মসজিদ থেকে মহিলাদের নামাজের ব্যবস্থা অপশন সরাতে চান?";

    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`${API_BASE}/mosques/${id}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('mosque_token')}`
            },
            body: JSON.stringify({ has_female_facility: newStatus })
        });

        const json = await res.json();
        if (json.success) {
            alert('✅ মসজিদের তথ্য সফলভাবে আপডেট হয়েছে!');
            fetchStats();

            // Refresh current state
            const searchVal = document.getElementById('searchInput').value.trim();
            if (searchVal) {
                executeSearch(searchVal);
            } else if (userPinMarker) {
                searchNearbyAt(currentCenter.lat, currentCenter.lng);
            } else if (map.getZoom() >= ZOOM_THRESHOLD) {
                loadViewportMosques();
            }
        } else {
            alert('❌ আপডেট ব্যর্থ: ' + (json.error || 'অননুমোদিত'));
        }
    } catch (err) {
        alert('❌ সার্ভারের সাথে সংযোগ ব্যর্থ: ' + err.message);
    }
}

// ==========================================
// 9. Fetch Overall Mosque Stats
// ==========================================
async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/mosques/stats`);
        const data = await res.json();
        if (data.success) {
            const total = Number(data.total_mosques).toLocaleString('en-US');
            const female = Number(data.female_facility_mosques || 0).toLocaleString('en-US');
            document.getElementById('totalMosquesCount').innerHTML = `
                <b>${total}</b> টি মসজিদ (${female} টিতে মহিলাদের ব্যবস্থা)
            `;
        }
    } catch (err) {
        document.getElementById('totalMosquesCount').innerText = 'অফলাইন';
    }
}

// ==========================================
// 10. Admin Settings & Account Management
// ==========================================
function setupAdminModalListeners() {
    const adminModal = document.getElementById('adminModal');
    const openAdminBtn = document.getElementById('openAdminBtn');
    const closeAdminBtn = document.getElementById('closeAdminBtn');

    openAdminBtn.addEventListener('click', () => {
        adminModal.classList.add('active');
        document.getElementById('passMsg').style.display = 'none';
        document.getElementById('createUserMsg').style.display = 'none';
    });

    closeAdminBtn.addEventListener('click', () => {
        adminModal.classList.remove('active');
    });

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');

            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            document.getElementById(target).style.display = 'block';

            if (target === 'tabUserList') {
                loadUserList();
            }
        });
    });

    // Change Password Form
    const changePassForm = document.getElementById('changePassForm');
    const passMsg = document.getElementById('passMsg');

    changePassForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        passMsg.style.display = 'none';

        const currentPassword = document.getElementById('currPassInput').value;
        const newPassword = document.getElementById('newPassInput').value;

        try {
            const res = await fetch(`${API_BASE}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('mosque_token')}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await res.json();
            passMsg.style.display = 'block';

            if (data.success) {
                passMsg.style.background = '#dcfce7';
                passMsg.style.color = '#15803d';
                passMsg.innerText = '✅ ' + data.message;
                changePassForm.reset();
            } else {
                passMsg.style.background = '#fee2e2';
                passMsg.style.color = '#b91c1c';
                passMsg.innerText = '❌ ' + (data.error || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ!');
            }
        } catch (err) {
            passMsg.style.display = 'block';
            passMsg.style.background = '#fee2e2';
            passMsg.style.color = '#b91c1c';
            passMsg.innerText = '❌ সার্ভারের সাথে সংযোগ করা যায়নি।';
        }
    });

    // Create New User Form
    const createUserForm = document.getElementById('createUserForm');
    const createUserMsg = document.getElementById('createUserMsg');

    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        createUserMsg.style.display = 'none';

        const username = document.getElementById('newUsernameInput').value.trim();
        const password = document.getElementById('newUserPassInput').value;
        const role = document.getElementById('newUserRoleSelect').value;

        try {
            const res = await fetch(`${API_BASE}/auth/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('mosque_token')}`
                },
                body: JSON.stringify({ username, password, role })
            });

            const data = await res.json();
            createUserMsg.style.display = 'block';

            if (data.success) {
                createUserMsg.style.background = '#dcfce7';
                createUserMsg.style.color = '#15803d';
                createUserMsg.innerText = '✅ ' + data.message;
                createUserForm.reset();
            } else {
                createUserMsg.style.background = '#fee2e2';
                createUserMsg.style.color = '#b91c1c';
                createUserMsg.innerText = '❌ ' + (data.error || 'ইউজার তৈরি ব্যর্থ!');
            }
        } catch (err) {
            createUserMsg.style.display = 'block';
            createUserMsg.style.background = '#fee2e2';
            createUserMsg.style.color = '#b91c1c';
            createUserMsg.innerText = '❌ সার্ভারের সাথে সংযোগ করা যায়নি।';
        }
    });
}

// Load List of Accounts
async function loadUserList() {
    const container = document.getElementById('userListContainer');
    container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> লোড হচ্ছে...</div>';

    try {
        const res = await fetch(`${API_BASE}/auth/users`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('mosque_token')}` }
        });
        const data = await res.json();

        if (data.success && data.data) {
            container.innerHTML = '';
            data.data.forEach(u => {
                const item = document.createElement('div');
                item.className = 'user-item';
                item.innerHTML = `
                    <div>
                        <b><i class="fa-solid fa-user"></i> ${u.username}</b>
                        <span class="user-role-badge">${u.role.toUpperCase()}</span>
                        <div style="font-size:0.75rem; color:var(--text-muted);">তৈরি: ${new Date(u.created_at).toLocaleDateString('bn-BD')}</div>
                    </div>
                    <div>
                        <button class="btn btn-danger btn-sm" onclick="deleteUserAccount(${u.id}, '${u.username}')">
                            <i class="fa-solid fa-trash"></i> ডিলিট
                        </button>
                    </div>
                `;
                container.appendChild(item);
            });
        }
    } catch (e) {
        container.innerHTML = '<div style="color:red; text-align:center; padding:15px;">ইউজার তালিকা লোড ব্যর্থ।</div>';
    }
}

// Delete User Account
async function deleteUserAccount(id, name) {
    if (!confirm(`আপনি কি নিশ্চিত '${name}' অ্যাকাউন্টটি মুছে ফেলতে চান?`)) return;

    try {
        const res = await fetch(`${API_BASE}/auth/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('mosque_token')}` }
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ অ্যাকাউন্ট মুছে ফেলা হয়েছে।');
            loadUserList();
        } else {
            alert('❌ ' + (data.error || 'ডিলিট ব্যর্থ!'));
        }
    } catch (e) {
        alert('❌ ত্রুটি: ' + e.message);
    }
}

// ==========================================
// 11. General Event Listeners & CSV Upload
// ==========================================
function setupEventListeners() {
    setupSearchHandler();

    // Female Only Toggle
    document.getElementById('femaleOnlyToggle').addEventListener('change', () => {
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
            executeSearch(query);
        } else if (userPinMarker) {
            searchNearbyAt(currentCenter.lat, currentCenter.lng);
        } else if (map.getZoom() >= ZOOM_THRESHOLD) {
            loadViewportMosques();
        }
    });

    // Locate Me Button
    document.getElementById('locateBtn').addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert('আপনার ব্রাউজারে Geolocation সাপোর্ট করে না।');
            return;
        }

        const locateBtn = document.getElementById('locateBtn');
        locateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> অবস্থান শনাক্ত হচ্ছে...';

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                locateBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> আমার আশেপাশে';
                map.flyTo([pos.coords.latitude, pos.coords.longitude], 15);
                searchNearbyAt(pos.coords.latitude, pos.coords.longitude);
            },
            (err) => {
                locateBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> আমার আশেপাশে';
                alert('লোকেশন পাওয়া যায়নি: ' + err.message);
            },
            { enableHighAccuracy: true }
        );
    });

    // Radius select change
    document.getElementById('radiusSelect').addEventListener('change', () => {
        if (userPinMarker) {
            searchNearbyAt(currentCenter.lat, currentCenter.lng);
        }
    });

    // CSV Import Modal Handlers
    const modal = document.getElementById('importModal');
    const openBtn = document.getElementById('openImportBtn');
    const closeBtn = document.getElementById('closeImportBtn');
    const cancelBtn = document.getElementById('cancelUploadBtn');
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const selectedFileName = document.getElementById('selectedFileName');
    const importResult = document.getElementById('importResult');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');

    openBtn.addEventListener('click', () => {
        modal.classList.add('active');
        importResult.style.display = 'none';
        progressContainer.style.display = 'none';
    });

    const closeModal = () => {
        modal.classList.remove('active');
        selectedFile = null;
        fileInput.value = '';
        selectedFileName.style.display = 'none';
        uploadBtn.disabled = true;
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('শুধুমাত্র .csv ফরম্যাটের ফাইল আপলোড করুন।');
            return;
        }
        selectedFile = file;
        selectedFileName.innerText = `📄 নির্বাচিত ফাইল: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        selectedFileName.style.display = 'block';
        uploadBtn.disabled = false;
        importResult.style.display = 'none';
    }

    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadBtn.disabled = true;
        progressContainer.style.display = 'block';
        progressFill.style.width = '40%';
        document.getElementById('progressText').innerText = 'সার্ভারে আপলোড এবং ডাটাবেসে সেভ হচ্ছে...';

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const res = await fetch(`${API_BASE}/mosques/import`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('mosque_token')}`
                },
                body: formData
            });

            const json = await res.json();
            progressFill.style.width = '100%';

            if (json.success) {
                document.getElementById('progressText').innerText = '✅ ইমপোর্ট সম্পন্ন হয়েছে!';
                importResult.style.display = 'block';
                importResult.className = 'import-result success';
                importResult.innerHTML = `
                    <b>🎉 সফলভাবে সম্পন্ন হয়েছে!</b><br>
                    • মোট প্রসেস করা হয়েছে: ${Number(json.total_processed).toLocaleString('en-US')} টি মসজিদ<br>
                    • ডাটাবেসে মোট মজুদ: <b>${Number(json.total_in_database).toLocaleString('en-US')} টি</b><br>
                    • মহিলাদের ব্যবস্থাযুক্ত মসজিদ: <b>${Number(json.female_facility_mosques || 0).toLocaleString('en-US')} টি</b>
                `;
                fetchStats();
                if (map.getZoom() >= ZOOM_THRESHOLD) {
                    loadViewportMosques();
                }
            } else {
                document.getElementById('progressText').innerText = '❌ ইমপোর্ট ব্যর্থ হয়েছে!';
                importResult.style.display = 'block';
                importResult.className = 'import-result error';
                importResult.innerText = `ত্রুটি: ${json.error || 'ইমপোর্ট করা সম্ভব হয়নি।'}`;
            }
        } catch (err) {
            progressFill.style.width = '100%';
            document.getElementById('progressText').innerText = '❌ সংযোগ ত্রুটি!';
            importResult.style.display = 'block';
            importResult.className = 'import-result error';
            importResult.innerText = `সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে: ${err.message}`;
        } finally {
            uploadBtn.disabled = false;
        }
    });
}
