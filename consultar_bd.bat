@echo off
title Consulta de Base de Datos - EPP SafetyVision
cd /d "%~dp0"
chcp 65001 >nul
color 0E
"%~dp0.venv\Scripts\python.exe" "%~dp0backend\consultar_bd.py"
echo.
pause
