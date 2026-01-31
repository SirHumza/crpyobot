#!/bin/bash

# Crypto Sentinel Bot - VPS Setup Script
# Works on Ubuntu 20.04/22.04/24.04 and Debian 11/12

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   Crypto Sentinel Bot - VPS Setup Script             ${NC}"
echo -e "${BLUE}======================================================${NC}"

# Check requirements
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root or with sudo${NC}"
  exit 1
fi

echo -e "${GREEN}[1/5] Updating system packages...${NC}"
apt-get update && apt-get upgrade -y
apt-get install -y curl git build-essential

echo -e "${GREEN}[2/5] Installing Node.js 20 (LTS)...${NC}"
# Using NodeSource for latest Node.js versions
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo -e "${GREEN}[3/5] Verifying Node.js installation...${NC}"
node -v
npm -v

echo -e "${GREEN}[4/5] Installing PM2 (Process Manager)...${NC}"
npm install -g pm2

echo -e "${GREEN}[5/5] Installing Project Dependencies...${NC}"
# Navigate to script directory then up to root if running from inside
if [ -f "package.json" ]; then
    npm install
else
    echo -e "${BLUE}We are not in the project root. Please cd to the project folder and run 'npm install' manually after this.${NC}"
fi

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "Next Steps:"
echo -e "1. Copy .env.example to .env:  cp .env.example .env"
echo -e "2. Edit .env with your keys:   nano .env"
echo -e "3. Start the bot:              npm run start-bg"
echo -e "4. Monitor logs:               npm run logs"
echo -e "${BLUE}======================================================${NC}"
