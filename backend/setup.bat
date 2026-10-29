@echo off
REM SynergySphere Backend Setup Script for Windows

echo 🚀 Setting up SynergySphere Backend...

REM Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18.0.0 or higher.
    pause
    exit /b 1
)

echo ✅ Node.js detected
node -v

REM Install dependencies
echo 📦 Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully

REM Create logs directory
if not exist "logs" mkdir logs

REM Build the project
echo 🔨 Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Build failed
    pause
    exit /b 1
)

echo ✅ Build completed successfully

REM Check if .env exists
if not exist ".env" (
    echo ⚠️  .env file not found
    if exist ".env.example" (
        copy ".env.example" ".env"
        echo 📝 Created .env from .env.example
        echo Please edit .env file with your configuration
    ) else (
        echo ❌ .env.example not found. Please create .env manually
        pause
        exit /b 1
    )
)

REM Seed database
echo 🌱 Seeding database with sample data...
call npm run seed
if %errorlevel% neq 0 (
    echo ⚠️  Database seeding failed, but continuing...
) else (
    echo ✅ Database seeded successfully
)

echo.
echo 🎉 Backend setup completed successfully!
echo.
echo 📚 Next steps:
echo 1. Edit .env file with your configuration
echo 2. Start development server: npm run dev
echo 3. Or start production server: npm start
echo.
echo 📍 API will be available at: http://localhost:5000
echo 🔍 Health check: http://localhost:5000/api/health
echo.
echo 👤 Sample login credentials:
echo    Email: user@example.com
echo    Password: password123
echo.
echo 📖 Full documentation: Read README.md
echo.
pause
