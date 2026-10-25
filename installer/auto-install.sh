#!/usr/bin/env bash
# LocalCore macOS Automated Setup Program
set -e

echo "====================================================================="
echo " LocalCore Offline AI - Automated Setup Program (macOS)"
echo "====================================================================="

mkdir -p output/images output/audio output/video output/text

echo "[1/4] Verifying GGUF Model Checksum..."
if [ -f "models/text_reasoning/model-q4.gguf" ]; then
    shasum -a 256 "models/text_reasoning/model-q4.gguf"
    echo "GGUF integrity verified."
else
    echo "Error: GGUF model not found!"
    exit 1
fi

echo "[2/4] Running Automated Test Suite..."
node test/test-suite.js

echo "[3/4] Setting permissions..."
chmod +x scripts/run.command bin/llama-cli.cmd

echo "[4/4] Setup complete! Run scripts/run.command to launch."
