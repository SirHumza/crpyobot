#!/bin/bash

# =============================================================================
# CRYPTO SENTINEL BOT - ALL-IN-ONE INSTALLER (macOS & Linux)
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}      CRYPTO SENTINEL BOT - INSTALLER                 ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. Check OS
OS_TYPE=$(uname)
echo -e "${YELLOW}Detecting OS... ${NC}Found $OS_TYPE"

# 2. Check Dependencies
check_dep() {
    if ! command -v $1 &> /dev/null; then
        return 1
    fi
    return 0
}

install_deps_linux() {
    echo -e "${YELLOW}Installing dependencies for Linux...${NC}"
    sudo apt-get update
    sudo apt-get install -y nodejs npm git curl
}

install_deps_macos() {
    echo -e "${YELLOW}Installing dependencies for macOS...${NC}"
    if ! check_dep brew; then
        echo -e "${YELLOW}Homebrew not found. Installing Homebrew...${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install node
}

if [ "$OS_TYPE" == "Linux" ]; then
    if ! check_dep node || ! check_dep npm; then
        install_deps_linux
    fi
elif [ "$OS_TYPE" == "Darwin" ]; then
    if ! check_dep node || ! check_dep npm; then
        install_deps_macos
    fi
else
    echo -e "${RED}Unsupported OS type: $OS_TYPE${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js and NPM are ready.${NC}"

# 3. Install NPM Packages
echo -e "${YELLOW}Installing bot dependencies...${NC}"
npm install

# 4. Configuration Wizard
echo -e "${BLUE}------------------------------------------------------${NC}"
echo -e "${YELLOW}CONFIGURATION WIZARD${NC}"
echo -e "${BLUE}------------------------------------------------------${NC}"

if [ ! -f .env ]; then
    cp .env.example .env
    
    echo -e "${YELLOW}Please enter your configuration details:${NC}"
    
    read -p "Binance API Key: " bin_key
    read -p "Binance API Secret: " bin_sec
    read -p "Gemini API Key (for news analysis): " gem_key
    read -p "Discord Webhook URL (optional, press enter to skip): " disc_webhook
    read -p "Discord Bot Token (optional, press enter to skip): " disc_token
    read -p "Discord Channel ID (optional, press enter to skip): " disc_chan
    read -p "Discord Admin User ID (your ID, optional): " disc_admin
    
    # Use sed to update .env
    # Note: On macOS sed needs an empty string for -i
    if [ "$OS_TYPE" == "Darwin" ]; then
        sed -i '' "s/BINANCE_API_KEY=.*/BINANCE_API_KEY=$bin_key/" .env
        sed -i '' "s/BINANCE_API_SECRET=.*/BINANCE_API_SECRET=$bin_sec/" .env
        sed -i '' "s/GEMINI_API_KEY=.*/GEMINI_API_KEY=$gem_key/" .env
        sed -i '' "s/DISCORD_WEBHOOK_URL=.*/DISCORD_WEBHOOK_URL=$disc_webhook/" .env
        sed -i '' "s/DISCORD_BOT_TOKEN=.*/DISCORD_BOT_TOKEN=$disc_token/" .env
        sed -i '' "s/DISCORD_CHANNEL_ID=.*/DISCORD_CHANNEL_ID=$disc_chan/" .env
        sed -i '' "s/DISCORD_ADMIN_USER_IDS=.*/DISCORD_ADMIN_USER_IDS=$disc_admin/" .env
    else
        sed -i "s/BINANCE_API_KEY=.*/BINANCE_API_KEY=$bin_key/" .env
        sed -i "s/BINANCE_API_SECRET=.*/BINANCE_API_SECRET=$bin_sec/" .env
        sed -i "s/GEMINI_API_KEY=.*/GEMINI_API_KEY=$gem_key/" .env
        sed -i "s/DISCORD_WEBHOOK_URL=.*/DISCORD_WEBHOOK_URL=$disc_webhook/" .env
        sed -i "s/DISCORD_BOT_TOKEN=.*/DISCORD_BOT_TOKEN=$disc_token/" .env
        sed -i "s/DISCORD_CHANNEL_ID=.*/DISCORD_CHANNEL_ID=$disc_chan/" .env
        sed -i "s/DISCORD_ADMIN_USER_IDS=.*/DISCORD_ADMIN_USER_IDS=$disc_admin/" .env
    fi
    
    echo -e "${GREEN}✓ .env file updated.${NC}"
else
    echo -e "${YELLOW}.env already exists. Skipping wizard.${NC}"
fi

# 5. Create necessary directories
mkdir -p logs data

# 6. Final Instructions
echo -e "${BLUE}------------------------------------------------------${NC}"
echo -e "${GREEN}SUCCESS! Bot is ready to deploy.${NC}"
echo -e "${BLUE}------------------------------------------------------${NC}"
echo -e "To start the bot in paper trading mode (SAFE):"
echo -e "${YELLOW}  npm run paper${NC}"
echo -e ""
echo -e "To start the bot in LIVE mode (REAL MONEY):"
echo -e "${YELLOW}  npm start${NC}"
echo -e ""
echo -e "To keep it running 24/7 (standalone mode):"
echo -e "${YELLOW}  npm run start-bg${NC}"
echo -e ""
echo -e "To view logs while running in background:"
echo -e "${YELLOW}  npm run logs${NC}"
echo -e ""
echo -e "To stop the bot:"
echo -e "${YELLOW}  npm run stop-bg${NC}"
echo -e "${BLUE}------------------------------------------------------${NC}"
