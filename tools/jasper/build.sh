#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
JASPER_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$JASPER_DIR"
mvn -q -DskipTests package
export JASPER_SOURCE_DIR="$ROOT_DIR"
export JASPER_REPORT_DIR="$JASPER_DIR/target/reports"
java -cp "target/classes:target/dependency/*" FacturaJasperRenderer --compile
