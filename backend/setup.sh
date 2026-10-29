#!/bin/bash

# SynergySphere Backend Setup Script

echo "🚀 Setting up SynergySphere Backend..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18.0.0 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18.0.0 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if MongoDB is running
if ! command -v mongod &> /dev/null; then
    echo "⚠️  MongoDB is not installed or not in PATH."
    echo "Please install MongoDB and ensure it's running on localhost:27017"
    echo "You can also use Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create logs directory
mkdir -p logs

# Build the project
echo "🔨 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build completed successfully"

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "📝 Created .env from .env.example"
        echo "Please edit .env file with your configuration"
    else
        echo "❌ .env.example not found. Please create .env manually"
        exit 1
    fi
fi

# Test MongoDB connection
echo "🔍 Testing MongoDB connection..."
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/synergysphere')
  .then(() => {
    console.log('✅ MongoDB connection successful');
    mongoose.disconnect();
  })
  .catch((err) => {
    console.log('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "❌ MongoDB connection test failed"
    echo "Please ensure MongoDB is running on localhost:27017"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Seed database
echo "🌱 Seeding database with sample data..."
npm run seed

if [ $? -ne 0 ]; then
    echo "⚠️  Database seeding failed, but continuing..."
else
    echo "✅ Database seeded successfully"
fi

echo ""
echo "🎉 Backend setup completed successfully!"
echo ""
echo "📚 Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Start development server: npm run dev"
echo "3. Or start production server: npm start"
echo ""
echo "📍 API will be available at: http://localhost:5000"
echo "🔍 Health check: http://localhost:5000/api/health"
echo ""
echo "👤 Sample login credentials:"
echo "   Email: user@example.com"
echo "   Password: password123"
echo ""
echo "📖 Full documentation: Read README.md"
