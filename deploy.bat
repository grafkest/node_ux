@echo off
REM Скрипт для развёртывания Nedra Expert Node на Windows-сервере
REM Использование: deploy.bat

echo ========================================
echo   Развёртывание Nedra Expert Node
echo ========================================
echo.

REM Проверка наличия Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js не установлен. Установите Node.js 18+ перед продолжением.
    pause
    exit /b 1
)

echo [OK] Node.js версия:
node --version
echo.

REM Установка зависимостей
echo [1/4] Установка зависимостей...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Ошибка при установке зависимостей
    pause
    exit /b 1
)
echo.

REM Сборка фронтенда
echo [2/4] Сборка фронтенда...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Ошибка при сборке фронтенда
    pause
    exit /b 1
)
echo.

REM Создание директории для данных
if not exist "data" (
    echo [3/4] Создание директории data...
    mkdir data
)

REM Проверка наличия PM2
where pm2 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] PM2 не установлен.
    echo Установить PM2 глобально? (Y/N)
    set /p INSTALL_PM2=
    if /i "%INSTALL_PM2%"=="Y" (
        call npm install -g pm2
        call pm2 install pm2-windows-startup
        call pm2-startup install
        echo [OK] PM2 установлен
    ) else (
        echo [WARNING] PM2 не установлен. Используйте 'npm run server' для ручного запуска.
        goto :skip_pm2
    )
)

REM Запуск backend с PM2
echo [4/4] Запуск backend сервера через PM2...

REM Остановка старого процесса (если существует)
call pm2 delete nedra-expert-api >nul 2>nul

REM Установка порта (по умолчанию 3003)
if "%PORT%"=="" set PORT=3003

REM Запуск нового процесса
call pm2 start npm --name "nedra-expert-api" -- run server
call pm2 save

echo.
echo [OK] Backend успешно запущен на порту %PORT%
echo.
echo Полезные команды PM2:
echo   pm2 status                   - проверить статус
echo   pm2 logs nedra-expert-api    - показать логи
echo   pm2 restart nedra-expert-api - перезапустить
echo   pm2 stop nedra-expert-api    - остановить
goto :success

:skip_pm2
echo.
echo [INFO] PM2 не установлен. Для запуска backend вручную используйте:
echo   set PORT=3003
echo   npm run server

:success
echo.
echo ========================================
echo   Развёртывание завершено!
echo ========================================
echo.
echo Следующие шаги:
echo 1. Статические файлы находятся в: %CD%\dist
echo 2. Настройте IIS или используйте Node.js для раздачи статики
echo 3. Backend API доступен на: http://localhost:%PORT%
echo.
pause
