@echo off
cd /d "%~dp0"
where pythonw >nul 2>nul && (start "" pythonw poe_app.py & exit /b)
where pyw >nul 2>nul && (start "" pyw -3 poe_app.py & exit /b)
where python >nul 2>nul && (start "" python poe_app.py & exit /b)
echo Python wurde nicht gefunden. Bitte Python von python.org installieren (Haken bei "Add to PATH").
pause
