#!/bin/bash
# X11 Automation Diagnostic Script
# Checks if XTest extension is enabled and working

set -e

echo "=== X11 Automation Diagnostics ==="
echo ""

# Check if running in X11
echo "1. Session Type:"
echo "   XDG_SESSION_TYPE=$XDG_SESSION_TYPE"
echo "   DISPLAY=$DISPLAY"
echo ""

if [ "$XDG_SESSION_TYPE" != "x11" ]; then
    echo "   ❌ ERROR: Not running X11 session (found: $XDG_SESSION_TYPE)"
    echo "   XTest only works in X11, not Wayland"
    exit 1
fi

# Check X11 connection
echo "2. X11 Connection:"
if xdpyinfo > /dev/null 2>&1; then
    echo "   ✓ X11 display accessible"
else
    echo "   ❌ ERROR: Cannot connect to X11 display"
    exit 1
fi
echo ""

# Check XTest extension
echo "3. XTest Extension:"
if xdpyinfo | grep -q "XTEST"; then
    echo "   ✓ XTest extension available"
    xdpyinfo | grep "XTEST" | sed 's/^/   /'
else
    echo "   ❌ ERROR: XTest extension not available"
    echo "   Install with: sudo apt install xserver-xorg-input-all"
    exit 1
fi
echo ""

# Test cursor movement with xdotool
echo "4. Testing Cursor Movement (xdotool):"
if command -v xdotool > /dev/null; then
    CURRENT_POS=$(xdotool getmouselocation --shell)
    echo "   Current position: $CURRENT_POS"
    
    # Try moving cursor
    echo "   Testing: Moving cursor to (100, 100)..."
    xdotool mousemove 100 100
    sleep 0.1
    NEW_POS=$(xdotool getmouselocation --shell)
    echo "   New position: $NEW_POS"
    
    # Restore original position
    eval "$CURRENT_POS"
    xdotool mousemove $X $Y
    
    if echo "$NEW_POS" | grep -q "X=100"; then
        echo "   ✓ Cursor movement works"
    else
        echo "   ⚠ Warning: Cursor movement may not work correctly"
    fi
else
    echo "   ⚠ xdotool not installed (optional for testing)"
    echo "   Install with: sudo apt install xdotool"
fi
echo ""

# Check for Wayland compatibility layer
echo "5. XWayland Check:"
if [ -n "$WAYLAND_DISPLAY" ]; then
    echo "   ⚠ Warning: WAYLAND_DISPLAY is set ($WAYLAND_DISPLAY)"
    echo "   You're in XWayland (X11 over Wayland)"
    echo "   XTest may have limited functionality"
else
    echo "   ✓ Pure X11 session (no Wayland)"
fi
echo ""

# Check window manager
echo "6. Window Manager:"
WM=$(wmctrl -m 2>/dev/null | grep "Name:" | cut -d: -f2 | xargs)
if [ -n "$WM" ]; then
    echo "   Window Manager: $WM"
else
    echo "   Could not detect window manager"
fi
echo ""

echo "=== Summary ==="
if [ "$XDG_SESSION_TYPE" = "x11" ] && xdpyinfo | grep -q "XTEST"; then
    echo "✓ System ready for X11 automation"
    echo ""
    echo "Recommended: Run with RUST_LOG=debug for detailed logging:"
    echo "  RUST_LOG=debug bun run tauri dev"
else
    echo "❌ System NOT ready for X11 automation"
    echo "   Check errors above and fix them first"
fi
