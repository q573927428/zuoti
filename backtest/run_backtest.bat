@echo off
echo ========================================
echo   币安2年历史数据回测系统
echo ========================================
echo.

REM 检查Node.js版本
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未检测到Node.js，请先安装Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖
if not exist "node_modules" (
    echo 📦 安装依赖...
    call npm install
    if errorlevel 1 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
)

echo 🚀 开始回测...
echo.

REM 运行回测
node binance_2year_backtest.js

echo.
echo ========================================
echo   回测完成！
echo ========================================
pause
