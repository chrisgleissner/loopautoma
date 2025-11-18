#!/bin/bash
# Quick test script to run tauri dev and show automation logs

echo "Starting loopautoma with detailed automation logging..."
echo "Press Ctrl+C to stop when done testing"
echo ""
echo "Look for these log patterns:"
echo "  [LinuxAutomation] - Initialization messages"
echo "  [XKB] - Keyboard setup messages"  
echo "  [Automation] - Action execution details (cursor, click, typing)"
echo ""
sleep 2

cd "$(dirname "$0")"
bun run tauri dev 2>&1 | grep --line-buffered -E "\[LinuxAutomation\]|\[XKB\]|\[Automation\]|ActionStarted|ActionCompleted"
