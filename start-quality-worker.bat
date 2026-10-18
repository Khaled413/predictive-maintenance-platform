@echo off
title Industrial AI - Quality Inspection Worker
chcp 65001 > nul
cls
echo ==========================================================
echo Starting Quality Inspection Worker via Cloudflare Tunnel...
echo ==========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-quality-worker.ps1"
pause
