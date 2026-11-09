# 🕌 Bangladesh Mosque Map & Admin Portal (বাংলাদেশ মসজিদ ম্যাপ ও এডমিন পোর্টাল)

সম্পূর্ণ বাংলাদেশ জুড়ে মসজিদের ভৌগোলিক অবস্থান (নাম, অক্ষাংশ, দ্রাঘিমাংশ) সংরক্ষণ, মহিলাদের জন্য আলাদা নামাজের ব্যবস্থা (`has_female_facility`) ট্র্যাকিং ও আপডেট, ম্যাপে প্রদর্শন, ব্যবহারকারীর নিকটবর্তী মসজিদ অনুসন্ধান, সিকিউর লগইন সিস্টেম এবং সিএসভি (CSV) ডাটা সরাসরি ইমপোর্ট করার ফুল-স্ট্যাক ওয়েব অ্যাপ্লিকেশন ও REST API।

---

## ✨ প্রধান বৈশিষ্ঠ্যসমূহ (Key Features)

1. **🔐 ইউজার ও পাসওয়ার্ড সিকিউর লগইন (Authentication):**
   - ডিরেক্ট প্রবেশ বন্ধ; ইউজারনেম ও পাসওয়ার্ড দিয়ে যাচাই করে সেশন টোকেনের মাধ্যমে প্রবেশ করতে হয়।
   - এডমিন ক্রেডেনশিয়াল `.env` ফাইল থেকে সহজেই পরিবর্তনযোগ্য (`ADMIN_USERNAME` ও `ADMIN_PASSWORD`)।
   - সুরক্ষিত API এন্ডপয়েন্ট (অননুমোদিত কেউ ডাটা ইমপোর্ট বা এডিট করতে পারবে না)।
   - সহজ লগআউট বাটন।
2. **ইন্টারেক্টিভ লিফলেট ম্যাপ (Leaflet.js + MarkerCluster):**
   - ৫০,০০০+ মসজিদ থাকলেও ম্যাপ কখনো হ্যাং বা ল্যাগ করবে না (স্মার্ট মার্কার ক্লাস্টারিং)।
   - যেকোনো স্থানে ক্লিক করলেই নির্দিষ্ট ব্যাসার্ধের (Radius) ভিতরের সকল মসজিদ ফিল্টার হয়ে যাবে।
3. **নিকটবর্তী মসজিদ অনুসন্ধান (Nearby Search):**
   - ব্যবহারকারীর মোবাইল/ল্যাপটপের বর্তমান জিপিএস (GPS Geolocation) অবস্থান শনাক্ত করে ১-২০ কিমি পরিধির মসজিদ দেখায়।
   - MySQL এর **Spatial Indexing** এবং **ST_Distance_Sphere** ব্যবহার করে মিলিসেকেন্ডে নিখুঁত দূরত্ব হিসেব করে।
4. **🧕 মহিলাদের নামাজের ব্যবস্থা (Female Prayer Space Facility):**
   - ডাটাবেস কলাম: `has_female_facility BOOLEAN DEFAULT FALSE`।
   - ফ্রন্টএন্ডে **ফিল্টার টগল:** শুধুমাত্র মহিলাদের ব্যবস্থা আছে এমন মসজিদ আলাদাভাবে দেখার সুবিধা।
   - **আপডেট করার API:** ওয়েবসাইট বা মোবাইল অ্যাপ থেকেই যেকোনো মসজিদের মহিলাদের ব্যবস্থা সরাসরি আপডেট (`PATCH /api/v1/mosques/:id`) করার সুবিধা।
5. **সরাসরি CSV ফাইল ইমপোর্ট (Web UI & CLI Importer):**
   - **ওয়েব ইন্টারফেস:** ব্রাউজার থেকেই যেকোনো বিভাগের CSV ফাইল ড্র্যাগ & ড্রপ করে আপলোড করলেই স্বয়ংক্রিয়ভাবে ডাটাবেসে সেভ হয়ে যাবে।
   - **সিএলআই মোড:** টার্মিনাল থেকেই ১ ক্লিকে লক্ষাধিক রেকর্ড দ্রুত ইমপোর্ট করা যায়।
   - **ডুপ্লিকেট সুরক্ষা:** একই অক্ষাংশ ও দ্রাঘিমাংশের মসজিদ দুইবার ঢুকবে না (`ON DUPLICATE KEY UPDATE`)।
6. **Nginx Reverse Proxy সাব-পাথ সাপোর্ট:**
   - কোনো পোর্ট নাম্বার না লিখে সরাসরি `https://your-domain-or-ip/mosque-map` অথবা `https://your-domain-or-ip/mosque-admin` দিয়ে অ্যাক্সেস করার সুবিধা।

---

## 🌐 Nginx Reverse Proxy সেটআপ (পোর্ট ছাড়া সাব-পাথে অ্যাক্সেস)

যেমন `https://203.161.47.159/iqc-admin` চলছে, ঠিক তেমনি `https://203.161.47.159/mosque-map` দিয়ে ঢোকার জন্য আপনার Nginx কনফিগারে নিচের ব্লকটি যুক্ত করুন:

```nginx
# Mosque Map Proxy Block
location /mosque-map/ {
    proxy_pass http://127.0.0.1:7080/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

কনফিগারেশন টেস্ট ও রিলোড করুন:
```bash
sudo nginx -t
sudo systemctl reload nginx
```
ব্যাস! এখন কোনো পোর্ট নাম্বার ছাড়াই ব্রাউজারে প্রবেশ করতে পারবেন:
👉 **`https://YOUR_VPS_IP/mosque-map/`**

---

## 🔐 লগইন ক্রেডেনশিয়াল (Default Credentials)

আপনার `.env` ফাইলে ডিফল্ট ইউজারনেম ও পাসওয়ার্ড দেওয়া থাকে:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```
*(আপনি চাইলে `.env` ফাইল এডিট করে নিজের পছন্দমত স্ট্রং পাসওয়ার্ড দিয়ে `pm2 restart mosque-map --update-env` দিলেই তা কার্যকর হবে।)*

---

## 📡 REST API ডকুমেন্টেশন

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | ইউজার ও পাসওয়ার্ড দিয়ে লগইন | No |
| `GET` | `/api/v1/auth/verify` | সেশন যাচাই | Yes (Bearer Token) |
| `POST` | `/api/v1/auth/logout` | সেশন লগআউট | Yes |
| `GET` | `/api/v1/mosques/nearby` | নিকটবর্তী মসজিদসমূহ | No |
| `GET` | `/api/v1/mosques/search` | নাম অনুযায়ী মসজিদ অনুসন্ধান | No |
| `GET` | `/api/v1/mosques/stats` | মোট মসজিদ ও মহিলাদের ব্যবস্থার পরিসংখ্যান | No |
| `PATCH`| `/api/v1/mosques/:id` | মসজিদের তথ্য / মহিলাদের ব্যবস্থা আপডেট | **Yes** |
| `POST` | `/api/v1/mosques/import` | নতুন CSV আপলোড ও বাল্ক ডাটাবেস এন্ট্রি | **Yes** |

---

## 👨‍💻 Author & License
- **Author:** MD. SUMON ALI
- **License:** MIT License
