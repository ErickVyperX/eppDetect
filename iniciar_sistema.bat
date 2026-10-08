@echo off
title EPP SafetyVision - Sistema Local de Deteccion de EPP
cd /d "%~dp0"
chcp 65001 >nul
color 0B
echo ======================================================================
echo           EPP SafetyVision - Sistema de Monitoreo de Obra Local
echo ======================================================================
echo.
echo [1/3] Verificando entorno virtual y base de datos...
"%~dp0.venv\Scripts\python.exe" "%~dp0backend\init_db.py"
echo.
echo [2/3] Abriendo interfaz en el navegador web (http://localhost:8000)...
timeout /t 2 /nobreak >nul
start http://localhost:8000
echo.
echo [3/3] Iniciando Servidor Local de Monitoreo...
echo Presione CTRL+C en esta consola cuando desee detener el sistema.
echo ======================================================================
"%~dp0.venv\Scripts\python.exe" "%~dp0backend\main.py"
pause
