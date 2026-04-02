#!/bin/bash
echo "🚀 安裝後端依賴..."
cd backend && npm install

echo "🚀 安裝前端依賴..."
cd ../frontend && npm install

echo "✅ 安裝完成！"
echo ""
echo "請開兩個終端機分別執行："
echo "  終端機 1：cd backend && npm run dev"
echo "  終端機 2：cd frontend && npm run dev"
echo ""
echo "前端網址：http://localhost:5173"
echo "後端網址：http://localhost:3001"
