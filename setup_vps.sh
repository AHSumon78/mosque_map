#!/usr/bin/env bash
# ==============================================================================
# 🕌 Bangladesh Mosque Map & API - 1-Click VPS Automated Setup (Ubuntu/Debian)
# Port: 5000
# ==============================================================================

set -e

echo "=================================================================="
echo "🚀 Starting Mosque Map VPS Installation (Port: 5000)..."
echo "=================================================================="

# 1. Update OS Packages
echo "📦 Step 1/6: Updating system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw build-essential

# 2. Install Node.js 20 LTS
echo "📦 Step 2/6: Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 3. Install MySQL Server
echo "📦 Step 3/6: Installing MySQL Server..."
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql

# 4. Install PM2 Globally
echo "📦 Step 4/6: Installing PM2 Process Manager..."
sudo npm install -g pm2

# 5. Project Dependencies & Env Setup
echo "⚙️  Step 5/6: Setting up project environment..."
npm install

if [ ! -f .env ]; then
    echo "Creating .env configuration with PORT=5000..."
    cat <<EOT > .env
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=mosque_db
DB_PORT=3306
EOT
fi

# Initialize database schema
echo "🗄️ Step 6/6: Initializing MySQL Spatial Database..."
sudo mysql -e "CREATE DATABASE IF NOT EXISTS mosque_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm run setup-db

# 6. Start Application with PM2
echo "🚀 Starting App with PM2 on Port 5000..."
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

# Allow Port 5000 in UFW Firewall
sudo ufw allow 5000/tcp || true

echo "=================================================================="
echo "🎉 Congratulations! Mosque Map is LIVE on your VPS!"
echo "🌐 Access Web UI: http://$(curl -s ifconfig.me):5000"
echo "📊 Monitor with: pm2 status"
echo "📥 Import CSV: Open the Web UI and click 'CSV ইমপোর্ট করুন'"
echo "   OR via CLI: node database/import_cli.js /path/to/your.csv"
echo "=================================================================="
