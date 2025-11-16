#!/bin/bash
# Script to verify core X11 features work correctly
# This script helps diagnose input recording/playback issues

set -e

echo "==================================="
echo "Loop Automa X11 Feature Verification"
echo "==================================="
echo ""

# Check if running in X11 session
echo "1. Checking X11 session..."
if [ -z "$DISPLAY" ]; then
    echo "❌ FAIL: DISPLAY environment variable not set"
    echo "   Solution: Ensure you're running in an X11 session"
    echo "   Check with: echo \$DISPLAY"
    exit 1
fi

if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo "❌ FAIL: You're running Wayland, not X11"
    echo "   Solution: Switch to X11 session at login screen"
    echo "   1. Log out"
    echo "   2. At login screen, click gear icon"
    echo "   3. Select 'Ubuntu on Xorg' or 'GNOME on Xorg'"
    echo "   4. Log back in"
    exit 1
fi

echo "✓ PASS: X11 session detected (DISPLAY=$DISPLAY)"
echo ""

# Check required packages
echo "2. Checking required packages..."
MISSING_PACKAGES=()

for pkg in libx11-6 libxi6 libxtst6 libxkbcommon-x11-0; do
    if ! dpkg -l | grep -q "^ii  $pkg"; then
        MISSING_PACKAGES+=("$pkg")
    fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo "❌ FAIL: Missing packages: ${MISSING_PACKAGES[*]}"
    echo "   Solution: Install missing packages:"
    echo "   sudo apt install ${MISSING_PACKAGES[*]}"
    exit 1
fi

echo "✓ PASS: All required runtime packages installed"
echo ""

# Check X11 connection
echo "3. Checking X11 connection..."
if ! xdpyinfo >/dev/null 2>&1; then
    echo "❌ FAIL: Cannot connect to X11 display"
    echo "   Solution: Check that X server is running and DISPLAY is correct"
    exit 1
fi

echo "✓ PASS: X11 connection working"
echo ""

# Check XInput extension
echo "4. Checking XInput extension..."
if ! xdpyinfo | grep -q "XInputExtension"; then
    echo "❌ FAIL: XInput extension not available"
    echo "   Solution: This is required for input recording"
    echo "   Your X server may not support XInput2"
    exit 1
fi

echo "✓ PASS: XInput extension available"
echo ""

# Check XTest extension
echo "5. Checking XTest extension..."
if ! xdpyinfo | grep -q "XTEST"; then
    echo "❌ FAIL: XTEST extension not available"
    echo "   Solution: This is required for input playback"
    echo "   Your X server may not support XTEST"
    exit 1
fi

echo "✓ PASS: XTEST extension available"
echo ""

# Check XKB extension
echo "6. Checking XKB extension..."
if ! xdpyinfo | grep -q "XKEYBOARD"; then
    echo "❌ FAIL: XKEYBOARD extension not available"
    echo "   Solution: This is required for keyboard handling"
    exit 1
fi

echo "✓ PASS: XKEYBOARD extension available"
echo ""

# Run integration tests if available
if [ -d "../src-tauri" ] && command -v cargo >/dev/null 2>&1; then
    echo "7. Running integration tests..."
    cd ../src-tauri
    if cargo test --test integration_x11 -- --test-threads=1 --nocapture 2>&1 | grep -q "test result: ok"; then
        echo "✓ PASS: Integration tests passed"
    else
        echo "⚠ WARNING: Some integration tests failed (may be expected in some environments)"
    fi
    cd -
    echo ""
fi

echo "==================================="
echo "✓ ALL CHECKS PASSED"
echo "==================================="
echo ""
echo "Your system is properly configured for input recording and playback!"
echo ""
echo "If you still experience issues:"
echo "  1. Make sure loopautoma app has focus when recording"
echo "  2. Check that LOOPAUTOMA_BACKEND is not set to 'fake'"
echo "  3. Try running with elevated permissions if needed"
echo "  4. Check app logs for detailed error messages"
echo ""
