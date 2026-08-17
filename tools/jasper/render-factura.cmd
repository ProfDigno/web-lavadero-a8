@echo off
setlocal
set "JASPER_DIR=%~dp0"
for %%I in ("%JASPER_DIR%\..\..") do set "JASPER_SOURCE_DIR=%%~fI"
set "JASPER_REPORT_DIR=%JASPER_DIR%target\reports"
java -cp "%JASPER_DIR%target\classes;%JASPER_DIR%target\dependency\*" FacturaJasperRenderer %*
