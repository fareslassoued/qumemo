#!/usr/bin/env bash
# First time: uv run --extra convert python convert_model.py
# Then:       ./run.sh
cd "$(dirname "$0")" && uv run python server.py
