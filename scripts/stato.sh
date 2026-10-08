#!/usr/bin/env bash
# Stato di build e del modello della skill.
source "$(dirname "$0")/common.sh"
smapi get-skill-status -s "$(skill_id)"
