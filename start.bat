@echo off
chcp 65001 >nul
REM ============================================================
REM  AI 智能试衣间 —— 一键本地启动
REM  双击这个文件即可。第一次会自动安装所需环境与依赖。
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"
