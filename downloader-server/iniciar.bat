@echo off
cd /d "%~dp0"
title Servidor do Baixador
REM Para usar fora do PC, tire o REM das duas linhas abaixo e preencha:
REM set API_KEY=escolha-uma-senha-grande
REM set ALLOWED_ORIGINS=https://ENDERECO-DO-SEU-APP
python -c "import fastapi, uvicorn, yt_dlp" 2>nul
if errorlevel 1 python -m pip install -r requirements.txt
echo.
echo Servidor ligando em http://localhost:8000  (deixe esta janela aberta)
python -m uvicorn app:app --host 0.0.0.0 --port 8000
pause
