@echo off
echo Killing all Node processes to free ports...
taskkill /F /IM node.exe
echo.
echo Starting Vite on port 5175 (strict)...
npx vite --port 5175 --strictPort
pause



