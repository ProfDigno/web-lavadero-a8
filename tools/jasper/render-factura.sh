#!/usr/bin/env bash
set -euo pipefail
JASPER_DIR="$(cd "$(dirname "$0")" && pwd)"
export JASPER_SOURCE_DIR="$(cd "$JASPER_DIR/../.." && pwd)"
export JASPER_REPORT_DIR="$JASPER_DIR/target/reports"
exec java -cp "$JASPER_DIR/target/classes:$JASPER_DIR/target/dependency/*" FacturaJasperRenderer "$@"
