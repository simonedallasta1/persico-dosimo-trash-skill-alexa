#!/usr/bin/env bash
# Stato di build della skill: manifest, modello vocale, codice.
source "$(dirname "$0")/common.sh"
info "Stato della skill"
report_status || true
