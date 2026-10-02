#!/bin/bash
set -e

echo "📦 Setting up Predictive Maintenance Platform..."

echo "Installing Node dependencies..."
npm install

echo "Installing Python dependencies..."
python -m pip install -r ml/requirements.txt

echo "✅ Setup complete"
echo "Run: npm run dev"
