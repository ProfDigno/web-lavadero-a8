@echo off
setlocal
set "JASPER_DIR=%~dp0"
for %%I in ("%JASPER_DIR%\..\..") do set "ROOT_DIR=%%~fI"
cd /d "%JASPER_DIR%"
call mvn -q -DskipTests package
set "JASPER_SOURCE_DIR=%ROOT_DIR%"
set "JASPER_REPORT_DIR=%JASPER_DIR%target\reports"
java -cp "target\classes;target\dependency\*" FacturaJasperRenderer --compile
