# 🕌 Bangladesh Mosque Map & Nearby API (বাংলাদেশ মসজিদ ম্যাপ)

সম্পূর্ণ বাংলাদেশ জুড়ে মসজিদের ভৌগোলিক অবস্থান (নাম, অক্ষাংশ, দ্রাঘিমাংশ) সংরক্ষণ, মহিলাদের জন্য আলাদা নামাজের ব্যবস্থা (`has_female_facility`) ট্র্যাকিং ও আপডেট, ম্যাপে প্রদর্শন, ব্যবহারকারীর নিকটবর্তী মসজিদ অনুসন্ধান এবং সিএসভি (CSV) ডাটা সরাসরি ইমপোর্ট করার ফুল-স্ট্যাক ওয়েব অ্যাপ্লিকেশন ও REST API।

---

## ✨ প্রধান বৈশিষ্ঠ্যসমূহ (Key Features)

1. **ইন্টারেক্টিভ লিফলেট ম্যাপ (Leaflet.js + MarkerCluster):**
   - ৫০,০০০+ মসজিদ থাকলেও ম্যাপ কখনো হ্যাং বা ল্যাগ করবে না (স্মার্ট মার্কার ক্লাস্টারিং)।
   - যেকোনো স্থানে ক্লিক করলেই নির্দিষ্ট ব্যাসার্ধের (Radius) ভিতরের সকল মসজিদ ফিল্টার হয়ে যাবে।
2. **নিকটবর্তী মসজিদ অনুসন্ধান (Nearby Search):**
   - ব্যবহারকারীর মোবাইল/ল্যাপটপের বর্তমান জিপিএস (GPS Geolocation) অবস্থান শনাক্ত করে ১-২০ কিমি পরিধির মসজিদ দেখায়।
   - MySQL এর **Spatial Indexing** এবং **ST_Distance_Sphere** ব্যবহার করে মিলিসেকেন্ডে নিখুঁত দূরত্ব হিসেব করে।
3. **🧕 মহিলাদের নামাজের ব্যবস্থা (Female Prayer Space Facility):**
   - ডাটাবেস কলাম: `has_female_facility BOOLEAN DEFAULT FALSE`।
   - ফ্রন্টএন্ডে **ফিল্টার টগল:** শুধুমাত্র মহিলাদের ব্যবস্থা আছে এমন মসজিদ আলাদাভাবে দেখার সুবিধা।
   - **আপডেট করার API:** ওয়েবসাইট বা মোবাইল অ্যাপ থেকেই যেকোনো মসজিদের মহিলাদের ব্যবস্থা সরাসরি আপডেট (`PATCH /api/v1/mosques/:id`) করার সুবিধা।
4. **সরাসরি CSV ফাইল ইমপোর্ট (Web UI & CLI Importer):**
   - **ওয়েব ইন্টারফেস:** ব্রাউজার থেকেই যেকোনো বিভাগের CSV ফাইল ড্র্যাগ & ড্রপ করে আপলোড করলেই স্বয়ংক্রিয়ভাবে ডাটাবেসে সেভ হয়ে যাবে।
   - **সিএলআই মোড:** টার্মিনাল থেকেই ১ ক্লিকে লক্ষাধিক রেকর্ড দ্রুত ইমপোর্ট করা যায়।
   - **ডুপ্লিকেট সুরক্ষা:** একই অক্ষাংশ ও দ্রাঘিমাংশের মসজিদ দুইবার ঢুকবে না (`ON DUPLICATE KEY UPDATE`)।
5. **মসজিদের নাম দিয়ে সার্চ:**
   - যেকোনো মসজিদের নাম দিয়ে লাইভ সার্চ করার সুবিধা।
6. **VPS এবং প্রোডাকশন রেডি (Default Port: 5000):**
   - পোর্ট **5000** কনফিগার করা (যাতে 3000/3001 পোর্টের সাথে কনফ্লিক্ট না করে)।
   - উবুন্টু/ডেবিয়ান ভিপিএস (Ubuntu/Debian VPS)-এ মাত্র ১টি কমান্ডেই ডিপ্লয় করার জন্য `setup_vps.sh`, `ecosystem.config.js` (PM2) এবং `docker-compose.yml` অন্তর্ভুক্ত।

---

## 🚀 ভিপিএস-এ ডিপ্লয় করার নির্দেশিকা (VPS Deployment Guide)

### ধাপ ১: আপনার VPS-এ লগইন করে ক্লোন করুন
```bash
git clone https://github.com/AHSumon78/mosque_map.git
cd mosque_map
```

### পদ্ধতি ১: অটোমেটিক ১-ক্লিক সেটআপ (সবচেয়ে সহজ - Ubuntu/Debian)
আমরা একটি স্ক্রিপ্ট তৈরি করে রেখেছি যা স্বয়ংক্রিয়ভাবে Node.js, MySQL, PM2 ইন্সটল ও কনফিগার করে পোর্ট 5000-এ সার্ভার লাইভ করে দেবে:
```bash
chmod +x setup_vps.sh
./setup_vps.sh
```

---

### পদ্ধতি ২: ম্যানুয়াল সেটআপ (Step-by-step)

#### ১. প্যাকেজ ইন্সটল করুন:
```bash
sudo apt update && sudo apt install -y nodejs npm mysql-server
npm install
```

#### ২. `.env` ফাইল কনফিগার করুন:
```bash
cp .env.example .env
nano .env
```
আপনার কনফিগারেশন সেট করুন (ডিফল্ট পোর্ট 5000):
```env
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=mosque_db
DB_PORT=3306
```

#### ৩. ডাটাবেস ও টেবিল তৈরি করুন:
```bash
npm run setup-db
```

#### ৪. PM2 দিয়ে ব্যাকগ্রাউন্ডে সার্ভার রান করুন:
```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

সার্ভার চালু হয়ে গেলে ভিজিট করুন: **`http://YOUR_VPS_IP:5000`**

---

### পদ্ধতি ৩: ডকার দিয়ে ডিপ্লয় (Docker Compose)
আপনার VPS-এ Docker ইন্সটল করা থাকলে:
```bash
docker compose up -d --build
```

---

## 📥 CSV ডাটা ইমপোর্ট করার নিয়ম (How to Import CSV)

### অপশন ১: ব্রাউজার থেকে সরাসরি (Web UI)
1. ব্রাউজারে `http://YOUR_VPS_IP:5000` ওপেন করুন।
2. উপরের ডানদিকের **"CSV ইমপোর্ট করুন"** বাটনে ক্লিক করুন।
3. আপনার কম্পিউটার থেকে যেকোনো বিভাগের CSV ফাইল (যেমন `rajshahi_mosques.csv` বা `bangladesh_mosques.csv`) ড্র্যাগ করে দিন।
4. **"ইমপোর্ট শুরু করুন"** বাটনে চাপ দিলেই ডাটাবেসে নতুন মসজিদগুলো যুক্ত হয়ে যাবে এবং রিয়েল-টাইম কাউন্টার আপডেট হবে।

### অপশন ২: VPS টার্মিনাল থেকে (CLI)
আপনার সার্ভারে থাকা যেকোনো CSV ফাইল দ্রুত ইমপোর্ট করতে:
```bash
node database/import_cli.js /path/to/your_file.csv
```

---

## 📡 REST API ডকুমেন্টেশন (API Endpoints)

| Method | Endpoint | Description | Query / Body Parameters |
|---|---|---|---|
| `GET` | `/api/v1/health` | সার্ভার ও সার্ভিসের হেলথ চেক | None |
| `GET` | `/api/v1/mosques/stats` | মোট মসজিদ ও মহিলাদের ব্যবস্থার পরিসংখ্যান | None |
| `GET` | `/api/v1/mosques/nearby` | নির্দিষ্ট জিপিএস অবস্থানের নিকটবর্তী মসজিদসমূহ | `lat`, `lng`, `radius` (meters, default: 2000), `female_only` (1/0), `limit` |
| `GET` | `/api/v1/mosques/search` | নাম অনুযায়ী মসজিদ অনুসন্ধান | `q` (নামের কিওয়ার্ড), `female_only` (1/0), `limit` |
| `GET` | `/api/v1/mosques/bounds` | ম্যাপের ভিউপোর্টের বাউন্ডিং বক্স ডাটা | `minLat`, `maxLat`, `minLng`, `maxLng`, `female_only`, `limit` |
| `PATCH/PUT` | `/api/v1/mosques/:id` | **মসজিদের তথ্য / মহিলাদের নামাজের ব্যবস্থা আপডেট** | Body: `{"has_female_facility": true, "name": "নতুন নাম"}` |
| `POST` | `/api/v1/mosques/import` | নতুন CSV আপলোড ও বাল্ক ডাটাবেস এন্ট্রি | `file` (multipart/form-data) |

### API উদাহারণ:

#### ১. মহিলাদের নামাজের ব্যবস্থা আপডেট করা:
```bash
curl -X PATCH http://localhost:5000/api/v1/mosques/105 \
     -H "Content-Type: application/json" \
     -d '{"has_female_facility": true}'
```

**রেসপন্স:**
```json
{
  "success": true,
  "message": "Mosque updated successfully.",
  "data": {
    "id": 105,
    "name": "Baitul Mukarram National Mosque",
    "latitude": "23.7290120",
    "longitude": "90.4129540",
    "has_female_facility": 1,
    "updated_at": "2026-11-09T15:20:00.000Z"
  }
}
```

#### ২. নিকটবর্তী মসজিদ খোঁজা (শুধুমাত্র মহিলাদের ব্যবস্থা আছে এমন):
```bash
curl "http://localhost:5000/api/v1/mosques/nearby?lat=23.7258&lng=90.4127&radius=3000&female_only=1"
```

---

## 👨‍💻 Author & License
- **Author:** MD. SUMON ALI
- **License:** MIT License
