#!/bin/bash
# setup-hotkey.sh - Auto-configure global hotkey for desktop-waifu
#
# Exit codes:
#   0 - Success (binding added or already exists)
#   1 - Error (config not found, unknown compositor, etc)
#   2 - Conflict (Super+M already bound to something else)
#
# Modes:
#   --check    Only check if binding exists, don't modify
#   --json     Output machine-readable JSON
#   (default)  Setup the binding

MODE="setup"
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --check)
            MODE="check"
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# JSON output helper
json_result() {
    local status="$1"
    local message="$2"
    local compositor="$3"
    local config_file="$4"

    if $JSON_OUTPUT; then
        echo "{\"status\":\"$status\",\"message\":\"$message\",\"compositor\":\"$compositor\",\"config_file\":\"$config_file\"}"
    fi
}

# Colors for output (only if not JSON mode)
if ! $JSON_OUTPUT; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

log() {
    if ! $JSON_OUTPUT; then
        echo -e "$1"
    fi
}

# Find the desktop-waifu binary
BINARY_PATH=""
if command -v desktop-waifu-overlay &> /dev/null; then
    BINARY_PATH="desktop-waifu-overlay"
elif command -v desktop-waifu &> /dev/null; then
    BINARY_PATH="desktop-waifu"
elif [ -f "./target/release/desktop-waifu-overlay" ]; then
    BINARY_PATH="$(pwd)/target/release/desktop-waifu-overlay"
elif [ -f "./desktop-waifu-overlay/target/release/desktop-waifu-overlay" ]; then
    BINARY_PATH="$(pwd)/desktop-waifu-overlay/target/release/desktop-waifu-overlay"
elif [ -f "/usr/bin/desktop-waifu-overlay" ]; then
    BINARY_PATH="/usr/bin/desktop-waifu-overlay"
else
    log "${RED}Error: desktop-waifu binary not found${NC}"
    json_result "error" "Binary not found" "" ""
    exit 1
fi

log "${GREEN}Found binary: $BINARY_PATH${NC}"

# Detect compositor/WM
detect_compositor() {
    if [ -n "$SWAYSOCK" ]; then
        echo "sway"
    elif [ -n "$HYPRLAND_INSTANCE_SIGNATURE" ]; then
        echo "hyprland"
    elif [ -n "$I3SOCK" ]; then
        echo "i3"
    elif pgrep -x river > /dev/null; then
        echo "river"
    elif pgrep -x wayfire > /dev/null; then
        echo "wayfire"
    elif [ "$XDG_CURRENT_DESKTOP" = "KDE" ]; then
        echo "kde"
    elif [ "$XDG_CURRENT_DESKTOP" = "GNOME" ]; then
        echo "gnome"
    elif pgrep -x sway > /dev/null; then
        echo "sway"
    elif pgrep -x Hyprland > /dev/null; then
        echo "hyprland"
    elif pgrep -x i3 > /dev/null; then
        echo "i3"
    else
        echo "unknown"
    fi
}

# Check if Super+M is bound to something OTHER than desktop-waifu
check_conflict_sway_i3() {
    local config_file="$1"
    # Look for bindsym with various Super key representations + m that's NOT desktop-waifu
    # Covers: $mod+m, $mainMod+m, $super+m, Mod4+m (case insensitive for 'm')
    if grep -iE 'bindsym\s+(\$mod|\$mainMod|\$super|Mod4)\+m\s+' "$config_file" 2>/dev/null | grep -v "desktop-waifu" | grep -v "^#" | head -1; then
        return 0  # Conflict found
    fi
    return 1  # No conflict
}

check_conflict_hyprland() {
    local config_file="$1"
    # Look for bind with SUPER or $mainMod + M that's NOT desktop-waifu
    # Hyprland commonly uses $mainMod = SUPER convention
    if grep -iE 'bind[a-z]*\s*=\s*(\$mainMod|SUPER)\s*,\s*M\s*,' "$config_file" 2>/dev/null | grep -v "desktop-waifu" | grep -v "^#" | head -1; then
        return 0  # Conflict found
    fi
    return 1  # No conflict
}

COMPOSITOR=$(detect_compositor)
log "Detected compositor: ${GREEN}$COMPOSITOR${NC}"

case $COMPOSITOR in
    sway)
        CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/sway/config"
        BINDING="bindsym \$mod+m exec $BINARY_PATH --toggle"
        MARKER="# desktop-waifu hotkey"

        if [ ! -f "$CONFIG_FILE" ]; then
            log "${RED}Sway config not found at $CONFIG_FILE${NC}"
            json_result "error" "Config not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Check for existing desktop-waifu --toggle binding
        if grep -qE "desktop-waifu.*--toggle" "$CONFIG_FILE"; then
            log "${GREEN}Hotkey already configured${NC}"
            json_result "exists" "Already configured" "$COMPOSITOR" "$CONFIG_FILE"
            exit 0
        fi

        # Check for conflicts
        CONFLICT=$(check_conflict_sway_i3 "$CONFIG_FILE")
        if [ -n "$CONFLICT" ]; then
            log "${RED}Conflict: Super+M is already bound to something else:${NC}"
            log "$CONFLICT"
            json_result "conflict" "Super+M already bound: $CONFLICT" "$COMPOSITOR" "$CONFIG_FILE"
            exit 2
        fi

        if [ "$MODE" = "check" ]; then
            log "${YELLOW}Binding not configured${NC}"
            json_result "not_configured" "Binding not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Add the binding
        echo -e "\n$MARKER\n$BINDING" >> "$CONFIG_FILE"
        log "${GREEN}Added to $CONFIG_FILE${NC}"
        log "Run ${YELLOW}swaymsg reload${NC} to apply changes"
        json_result "added" "Binding added" "$COMPOSITOR" "$CONFIG_FILE"

        # Try to reload sway config
        swaymsg reload 2>/dev/null || true
        ;;

    hyprland)
        CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/hypr/hyprland.conf"
        BINDING="bind = SUPER, M, exec, $BINARY_PATH --toggle"
        MARKER="# desktop-waifu hotkey"

        if [ ! -f "$CONFIG_FILE" ]; then
            log "${RED}Hyprland config not found at $CONFIG_FILE${NC}"
            json_result "error" "Config not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Check for existing desktop-waifu --toggle binding
        if grep -qE "desktop-waifu.*--toggle" "$CONFIG_FILE"; then
            log "${GREEN}Hotkey already configured${NC}"
            json_result "exists" "Already configured" "$COMPOSITOR" "$CONFIG_FILE"
            exit 0
        fi

        # Check for conflicts
        CONFLICT=$(check_conflict_hyprland "$CONFIG_FILE")
        if [ -n "$CONFLICT" ]; then
            log "${RED}Conflict: Super+M is already bound to something else:${NC}"
            log "$CONFLICT"
            json_result "conflict" "Super+M already bound: $CONFLICT" "$COMPOSITOR" "$CONFIG_FILE"
            exit 2
        fi

        if [ "$MODE" = "check" ]; then
            log "${YELLOW}Binding not configured${NC}"
            json_result "not_configured" "Binding not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Add the binding
        echo -e "\n$MARKER\n$BINDING" >> "$CONFIG_FILE"
        log "${GREEN}Added to $CONFIG_FILE${NC}"
        log "Hyprland auto-reloads config, hotkey should work immediately"
        json_result "added" "Binding added" "$COMPOSITOR" "$CONFIG_FILE"
        ;;

    i3)
        CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/i3/config"
        [ ! -f "$CONFIG_FILE" ] && CONFIG_FILE="$HOME/.i3/config"
        BINDING="bindsym \$mod+m exec $BINARY_PATH --toggle"
        MARKER="# desktop-waifu hotkey"

        if [ ! -f "$CONFIG_FILE" ]; then
            log "${RED}i3 config not found${NC}"
            json_result "error" "Config not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Check for existing desktop-waifu --toggle binding
        if grep -qE "desktop-waifu.*--toggle" "$CONFIG_FILE"; then
            log "${GREEN}Hotkey already configured${NC}"
            json_result "exists" "Already configured" "$COMPOSITOR" "$CONFIG_FILE"
            exit 0
        fi

        # Check for conflicts
        CONFLICT=$(check_conflict_sway_i3 "$CONFIG_FILE")
        if [ -n "$CONFLICT" ]; then
            log "${RED}Conflict: Super+M is already bound to something else:${NC}"
            log "$CONFLICT"
            json_result "conflict" "Super+M already bound: $CONFLICT" "$COMPOSITOR" "$CONFIG_FILE"
            exit 2
        fi

        if [ "$MODE" = "check" ]; then
            log "${YELLOW}Binding not configured${NC}"
            json_result "not_configured" "Binding not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Add the binding
        echo -e "\n$MARKER\n$BINDING" >> "$CONFIG_FILE"
        log "${GREEN}Added to $CONFIG_FILE${NC}"
        log "Run ${YELLOW}i3-msg reload${NC} to apply changes"
        json_result "added" "Binding added" "$COMPOSITOR" "$CONFIG_FILE"

        # Try to reload i3 config
        i3-msg reload 2>/dev/null || true
        ;;

    kde)
        log "${YELLOW}KDE detected - creating custom shortcut${NC}"
        CONFIG_FILE="kglobalshortcutsrc"

        # Check if already configured
        if command -v kreadconfig5 &> /dev/null; then
            EXISTING=$(kreadconfig5 --file kglobalshortcutsrc --group "desktop-waifu" --key "toggle" 2>/dev/null)
            if [ -n "$EXISTING" ]; then
                log "${GREEN}Hotkey already configured${NC}"
                json_result "exists" "Already configured" "$COMPOSITOR" "$CONFIG_FILE"
                exit 0
            fi
        fi

        if [ "$MODE" = "check" ]; then
            log "${YELLOW}Binding not configured${NC}"
            json_result "not_configured" "Binding not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        if command -v kwriteconfig5 &> /dev/null; then
            kwriteconfig5 --file kglobalshortcutsrc --group "desktop-waifu" --key "_k_friendly_name" "Desktop Waifu"
            kwriteconfig5 --file kglobalshortcutsrc --group "desktop-waifu" --key "toggle" "Meta+M,none,Toggle Desktop Waifu"
            log "${GREEN}Shortcut registered with KDE${NC}"
            log "You may need to ${YELLOW}log out and back in${NC} for changes to take effect"
            json_result "added" "Binding added" "$COMPOSITOR" "$CONFIG_FILE"
        else
            log "${YELLOW}Manual setup required:${NC}"
            log "1. Open System Settings > Shortcuts > Custom Shortcuts"
            log "2. Add new Global Shortcut > Command/URL"
            log "3. Set trigger to Meta+M"
            log "4. Set action to: $BINARY_PATH --toggle"
            json_result "manual" "Manual setup required" "$COMPOSITOR" ""
            exit 1
        fi
        ;;

    gnome)
        log "${YELLOW}GNOME detected - using gsettings${NC}"
        CONFIG_FILE="gsettings"
        SHORTCUT_PATH="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/desktop-waifu/"

        # Get current custom keybindings
        CURRENT=$(gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings 2>/dev/null || echo "[]")

        if echo "$CURRENT" | grep -q "desktop-waifu"; then
            log "${GREEN}Hotkey already configured${NC}"
            json_result "exists" "Already configured" "$COMPOSITOR" "$CONFIG_FILE"
            exit 0
        fi

        if [ "$MODE" = "check" ]; then
            log "${YELLOW}Binding not configured${NC}"
            json_result "not_configured" "Binding not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Add new path to list
        if [ "$CURRENT" = "@as []" ] || [ "$CURRENT" = "[]" ]; then
            NEW_BINDINGS="['$SHORTCUT_PATH']"
        else
            NEW_BINDINGS=$(echo "$CURRENT" | sed "s/]$/, '$SHORTCUT_PATH']/")
        fi

        gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "$NEW_BINDINGS"
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$SHORTCUT_PATH name "Toggle Desktop Waifu"
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$SHORTCUT_PATH command "$BINARY_PATH --toggle"
        gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$SHORTCUT_PATH binding "<Super>m"

        log "${GREEN}Hotkey configured via gsettings${NC}"
        log "The hotkey should work immediately"
        json_result "added" "Binding added" "$COMPOSITOR" "$CONFIG_FILE"
        ;;

    river)
        CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/river/init"
        BINDING="riverctl map normal Super M spawn \"$BINARY_PATH --toggle\""
        MARKER="# desktop-waifu hotkey"

        if [ ! -f "$CONFIG_FILE" ]; then
            log "${RED}River config not found at $CONFIG_FILE${NC}"
            json_result "error" "Config not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Check for existing desktop-waifu --toggle binding
        if grep -qE "desktop-waifu.*--toggle" "$CONFIG_FILE"; then
            log "${GREEN}Hotkey already configured${NC}"
            json_result "exists" "Already configured" "$COMPOSITOR" "$CONFIG_FILE"
            exit 0
        fi

        # Check for conflicts (Super M already bound)
        if grep -E 'riverctl\s+map\s+normal\s+Super\s+M\s+' "$CONFIG_FILE" 2>/dev/null | grep -v "desktop-waifu" | grep -v "^#" | head -1; then
            CONFLICT=$(grep -E 'riverctl\s+map\s+normal\s+Super\s+M\s+' "$CONFIG_FILE" 2>/dev/null | grep -v "desktop-waifu" | grep -v "^#" | head -1)
            log "${RED}Conflict: Super+M is already bound to something else:${NC}"
            log "$CONFLICT"
            json_result "conflict" "Super+M already bound: $CONFLICT" "$COMPOSITOR" "$CONFIG_FILE"
            exit 2
        fi

        if [ "$MODE" = "check" ]; then
            log "${YELLOW}Binding not configured${NC}"
            json_result "not_configured" "Binding not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Add the binding
        echo -e "\n$MARKER\n$BINDING" >> "$CONFIG_FILE"
        log "${GREEN}Added to $CONFIG_FILE${NC}"
        log "Run ${YELLOW}. ~/.config/river/init${NC} or restart River to apply changes"
        json_result "added" "Binding added" "$COMPOSITOR" "$CONFIG_FILE"
        ;;

    wayfire)
        CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/wayfire.ini"
        MARKER="# desktop-waifu hotkey"

        if [ ! -f "$CONFIG_FILE" ]; then
            log "${RED}Wayfire config not found at $CONFIG_FILE${NC}"
            json_result "error" "Config not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Check for existing desktop-waifu --toggle binding
        if grep -qE "desktop-waifu.*--toggle" "$CONFIG_FILE"; then
            log "${GREEN}Hotkey already configured${NC}"
            json_result "exists" "Already configured" "$COMPOSITOR" "$CONFIG_FILE"
            exit 0
        fi

        # Check if [command] section exists
        if ! grep -q '^\[command\]' "$CONFIG_FILE"; then
            log "${YELLOW}Adding [command] section to wayfire.ini${NC}"
            echo -e "\n[command]" >> "$CONFIG_FILE"
        fi

        # Find a unique binding name
        BIND_NUM=1
        while grep -q "binding_desktop_waifu_$BIND_NUM" "$CONFIG_FILE" 2>/dev/null; do
            BIND_NUM=$((BIND_NUM + 1))
        done
        BIND_NAME="desktop_waifu_$BIND_NUM"

        if [ "$MODE" = "check" ]; then
            log "${YELLOW}Binding not configured${NC}"
            json_result "not_configured" "Binding not found" "$COMPOSITOR" "$CONFIG_FILE"
            exit 1
        fi

        # Add the binding under [command] section
        # Wayfire uses <super> KEY_M format
        sed -i "/^\[command\]/a\\
$MARKER\\
binding_$BIND_NAME = <super> KEY_M\\
command_$BIND_NAME = $BINARY_PATH --toggle" "$CONFIG_FILE"

        log "${GREEN}Added to $CONFIG_FILE${NC}"
        log "Wayfire should auto-reload, or restart to apply changes"
        json_result "added" "Binding added" "$COMPOSITOR" "$CONFIG_FILE"
        ;;

    *)
        log "${YELLOW}Could not auto-detect compositor${NC}"
        log ""
        log "Please add the following to your WM/compositor config:"
        log ""
        log "  Sway/i3:    bindsym \$mod+m exec $BINARY_PATH --toggle"
        log "  Hyprland:   bind = SUPER, M, exec, $BINARY_PATH --toggle"
        log "  River:      riverctl map normal Super M spawn \"$BINARY_PATH --toggle\""
        log "  Wayfire:    binding_desktop_waifu = <super> KEY_M"
        log "              command_desktop_waifu = $BINARY_PATH --toggle"
        log ""
        json_result "unknown" "Unknown compositor" "$COMPOSITOR" ""
        exit 1
        ;;
esac

if [ "$MODE" != "check" ]; then
    log "\n${GREEN}Setup complete!${NC}"
    log "Press ${GREEN}Super+M${NC} to toggle Desktop Waifu"
fi
