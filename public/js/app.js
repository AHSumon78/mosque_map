/**
 * Bangladesh Mosque Map - Frontend Application
 * Supports Reverse Proxy sub-paths, User Authentication, Spatial Search, and Facility Updates
 */

// Compute Dynamic API Base URL (works seamlessly both on root and sub-paths like /mosque-map/)
const currentPath = window.location.pathname.replace(/\/+$/, '');
const API_BASE = (currentPath ? currentPath : '') + '/api/v1';

// Global State
let map = null;
let markerCluster = null;
let currentCircle = null;
let userPinMarker = null;
let currentCenter = { lat: 23.8103, lng: 90.4125 }; // Default Dhaka center
let selectedFile = null;
let authToken = localStorage.getItem('mosque_token');

// Normal Mosque Icon
const mosqueIcon = L.divIcon({
    html: '<div style="background-color: #059669; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3); border: 2px solid white;"><i class="fa-solid fa-mosque" style="font-size: 13px;"></i></div>',
    className: 'custom-mosque-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
});

// Mosque with Female Facility Icon (Pink/Magenta Badge)
const femaleMosqueIcon = L.divIcon({
    html: '<div style="background-color: #db2777; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 6px rgba(219,39,119,0.4); border: 2px solid white;"><i class="fa-solid fa-person-dress" style="font-size: 15px;"></i></div>',
    className: 'custom-female-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
});

// User Location Pin Icon
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
// Authentication Handling
// ==========================================
async function checkAuthAndInit() {
    authToken = localStorage.getItem('mosque_token');

    if (!authToken) {
        showLoginScreen();
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/verify`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.success && data.authenticated) {
            showAppScreen(data.user?.username || 'Admin');
        } else {
            showLoginScreen();
        }
    } catch (err) {
        // If offline or error, prompt login
        showLoginScreen();
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
    } else {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

function setupAuthListeners() {
    const loginForm = document.getElementById('loginForm');
    const loginErrorMsg = document.getElementById('loginErrorMsg');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    // Login Form Submit
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

    // Logout
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
        window.location.reload();
    });
}

// ==========================================
// Map Application Logic
// ==========================================

// 1. Initialize Map
function initMap() {
    map = L.map('map', {
        center: [currentCenter.lat, currentCenter.lng],
        zoom: 7,
        zoomControl: true
    });

    // OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Marker Cluster
    markerCluster = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
    });
    map.addLayer(markerCluster);

    // Map Click Handler
    map.on('click', (e) => {
        searchNearbyAt(e.latlng.lat, e.latlng.lng);
    });

    setTimeout(() => map.invalidateSize(), 300);
}

// 2. Fetch Total Mosque & Female Facility Stats
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

// 3. Search Nearby Mosques
async function searchNearbyAt(lat, lng) {
    currentCenter = { lat, lng };
    const radius = parseInt(document.getElementById('radiusSelect').value, 10);
    const femaleOnly = document.getElementById('femaleOnlyToggle').checked;
    const resultsList = document.getElementById('resultsList');
    const searchStatus = document.getElementById('searchStatus');

    searchStatus.innerText = 'অনুসন্ধান হচ্ছে...';
    resultsList.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';

    // Update User/Search Pin on Map
    if (userPinMarker) map.removeLayer(userPinMarker);
    userPinMarker = L.marker([lat, lng], { icon: userLocationIcon }).addTo(map);
    userPinMarker.bindPopup('<b>অনুসন্ধান কেন্দ্রবিন্দু</b>').openPopup();

    // Update Radius Circle
    if (currentCircle) map.removeLayer(currentCircle);
    currentCircle = L.circle([lat, lng], {
        radius: radius,
        color: femaleOnly ? '#db2777' : '#059669',
        fillColor: femaleOnly ? '#f472b6' : '#10b981',
        fillOpacity: 0.12,
        weight: 1.5
    }).addTo(map);

    try {
        const femaleParam = femaleOnly ? '&female_only=1' : '';
        const res = await fetch(`${API_BASE}/mosques/nearby?lat=${lat}&lng=${lng}&radius=${radius}&limit=100${femaleParam}`);
        const json = await res.json();

        if (!json.success || !json.data || json.data.length === 0) {
            searchStatus.innerText = '০ টি পাওয়া গেছে';
            resultsList.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 30px;">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 8px;"></i>
                    <p>এই ${radius >= 1000 ? (radius / 1000) + ' কিমি' : radius + ' মিটার'} পরিধির মধ্যে ${femaleOnly ? 'মহিলাদের ব্যবস্থাযুক্ত ' : ''}কোনো মসজিদ পাওয়া যায়নি।</p>
                    <p style="font-size: 0.8rem; margin-top: 4px;">পরিধি বাড়িয়ে দেখুন অথবা ফিল্টার পরিবর্তন করুন।</p>
                </div>
            `;
            markerCluster.clearLayers();
            return;
        }

        searchStatus.innerText = `${json.data.length} টি পাওয়া গেছে`;
        renderMosqueResults(json.data);
        renderMapMarkers(json.data);

        // Fit map bounds to show query area
        map.fitBounds(currentCircle.getBounds());

    } catch (err) {
        console.error(err);
        searchStatus.innerText = 'ত্রুটি';
        resultsList.innerHTML = `<div style="color:red; text-align:center; padding:20px;">ডাটা লোড করতে সমস্যা হয়েছে।</div>`;
    }
}

// 4. Render Results in Sidebar
function renderMosqueResults(mosques) {
    const list = document.getElementById('resultsList');
    list.innerHTML = '';

    mosques.forEach((m) => {
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
                <span><i class="fa-solid fa-location-dot"></i> ${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}</span>
                ${distText ? `<span class="distance-tag">${distText} দূরে</span>` : ''}
            </div>
            <div style="margin-bottom: 8px;">
                ${femaleTagHtml}
            </div>
            <div style="display: flex; gap: 8px;">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}" target="_blank" class="btn btn-outline btn-sm">
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
            map.flyTo([m.latitude, m.longitude], 17);
        });

        list.appendChild(card);
    });
}

// 5. Render Mosque Markers on Leaflet
function renderMapMarkers(mosques) {
    markerCluster.clearLayers();

    mosques.forEach(m => {
        const hasFemale = m.has_female_facility === 1 || m.has_female_facility === true;
        const marker = L.marker([m.latitude, m.longitude], { 
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
                    📍 ${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}
                </div>
                <div style="display:flex; gap:6px;">
                    <a href="https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}" target="_blank" style="display:inline-block; background:#059669; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.75rem; font-weight:500;">
                        গুগল ম্যাপ
                    </a>
                    <button onclick="toggleFemaleFacility(${m.id}, ${hasFemale ? 1 : 0})" style="background:#db2777; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">
                        ${hasFemale ? 'ব্যবস্থা বাদ দিন' : 'মহিলাদের ব্যবস্থা আছে'}
                    </button>
                </div>
            </div>
        `);

        markerCluster.addLayer(marker);
    });
}

// 6. Toggle Female Facility via API (Protected with Auth Header)
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
            if (userPinMarker) {
                searchNearbyAt(currentCenter.lat, currentCenter.lng);
            }
        } else {
            alert('❌ আপডেট ব্যর্থ: ' + (json.error || 'অননুমোদিত'));
        }
    } catch (err) {
        alert('❌ সার্ভারের সাথে সংযোগ ব্যর্থ: ' + err.message);
    }
}

// 7. Name Search Handler
let searchTimeout;
function setupSearchHandler() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        const femaleOnly = document.getElementById('femaleOnlyToggle').checked;

        if (!query) {
            if (userPinMarker) {
                searchNearbyAt(currentCenter.lat, currentCenter.lng);
            }
            return;
        }

        searchTimeout = setTimeout(async () => {
            const resultsList = document.getElementById('resultsList');
            const searchStatus = document.getElementById('searchStatus');
            searchStatus.innerText = 'অনুসন্ধান হচ্ছে...';
            resultsList.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';

            try {
                const femaleParam = femaleOnly ? '&female_only=1' : '';
                const res = await fetch(`${API_BASE}/mosques/search?q=${encodeURIComponent(query)}&limit=40${femaleParam}`);
                const json = await res.json();

                if (!json.success || json.data.length === 0) {
                    searchStatus.innerText = '০ টি পাওয়া গেছে';
                    resultsList.innerHTML = `
                        <div style="text-align: center; color: var(--text-muted); padding: 30px;">
                            <p>"${query}" নামে কোনো মসজিদ খুঁজে পাওয়া যায়নি।</p>
                        </div>
                    `;
                    markerCluster.clearLayers();
                    return;
                }

                searchStatus.innerText = `${json.data.length} টি পাওয়া গেছে`;
                renderMosqueResults(json.data);
                renderMapMarkers(json.data);

                if (json.data.length > 0) {
                    map.flyTo([json.data[0].latitude, json.data[0].longitude], 14);
                }

            } catch (err) {
                searchStatus.innerText = 'ত্রুটি';
            }
        }, 350);
    });
}

// 8. Setup Event Listeners
function setupEventListeners() {
    setupSearchHandler();

    // Female Only Toggle
    document.getElementById('femaleOnlyToggle').addEventListener('change', () => {
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
            document.getElementById('searchInput').dispatchEvent(new Event('input'));
        } else if (userPinMarker) {
            searchNearbyAt(currentCenter.lat, currentCenter.lng);
        }
    });

    // Locate Me
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

    // Radius change
    document.getElementById('radiusSelect').addEventListener('change', () => {
        if (userPinMarker) {
            searchNearbyAt(currentCenter.lat, currentCenter.lng);
        }
    });

    // Modal Handlers
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

    // Dropzone click
    dropzone.addEventListener('click', () => fileInput.click());

    // File selected
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag & Drop
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
        if (!file.name.endsWith('.csv')) {
            alert('শুধুমাত্র .csv ফরম্যাটের ফাইল আপলোড করুন।');
            return;
        }
        selectedFile = file;
        selectedFileName.innerText = `📄 নির্বাচিত ফাইল: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        selectedFileName.style.display = 'block';
        uploadBtn.disabled = false;
        importResult.style.display = 'none';
    }

    // Upload & Import Button
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
                importResult.className = 'import-result success';
                importResult.innerHTML = `
                    <b>🎉 সফলভাবে সম্পন্ন হয়েছে!</b><br>
                    • মোট প্রসেস করা হয়েছে: ${Number(json.total_processed).toLocaleString('en-US')} টি মসজিদ<br>
                    • ডাটাবেসে মোট মজুদ: <b>${Number(json.total_in_database).toLocaleString('en-US')} টি</b><br>
                    • মহিলাদের ব্যবস্থাযুক্ত মসজিদ: <b>${Number(json.female_facility_mosques || 0).toLocaleString('en-US')} টি</b>
                `;
                fetchStats();
            } else {
                importResult.className = 'import-result error';
                importResult.innerText = `ত্রুটি: ${json.error || 'ইমপোর্ট করা সম্ভব হয়নি।'}`;
            }
        } catch (err) {
            progressFill.style.width = '100%';
            importResult.className = 'import-result error';
            importResult.innerText = `সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে: ${err.message}`;
        } finally {
            uploadBtn.disabled = false;
        }
    });
}
