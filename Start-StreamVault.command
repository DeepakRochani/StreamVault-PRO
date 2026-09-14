#!/bin/bash
# Get the directory of the script and cd into it
cd "$(dirname "$0")"

echo "========================================="
echo "       Starting StreamVault PRO          "
echo "========================================="

# Check if Node.js/npm is installed
if ! command -v npm &> /dev/null
then
    echo "Error: npm could not be found."
    echo "Please install Node.js from https://nodejs.org/"
    read -p "Press Enter to exit..."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies... (this might take a minute or two)"
    npm install
fi

echo "Launching application..."

# Open the browser after a short delay to let the server start
(sleep 2 && open http://localhost:10000) &

# Start the server
npm run server
