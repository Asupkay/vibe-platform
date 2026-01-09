# VIBE - Shell Integration for zsh
# Emits OSC 133 sequences for deterministic command boundary detection
# Prevents spoofing via VIBE_NONCE

# Emit OSC sequence with nonce
__vibe_osc() {
    printf "\033]133;%s;vibe=%s\007" "$1" "${VIBE_NONCE}"
}

# Base64 encode command text (for OSC payload)
__vibe_b64() {
    printf "%s" "$1" | base64 | tr -d '\n'
}

# After command completes
__vibe_precmd() {
    local exit_code=$?
    __vibe_osc "D;${exit_code}"  # Command end + exit code
    __vibe_osc "A"                # Prompt start
}

# Before executing command
__vibe_preexec() {
    local cmd="$1"
    __vibe_osc "C"                                     # Execution start
    # Send final command text as base64 (safer than reconstructing from keystrokes)
    printf "\033]133;VIBE;CMD;%s;vibe=%s\007" "$(__vibe_b64 "$cmd")" "${VIBE_NONCE}"
}

# Hook into zsh's prompt system
autoload -Uz add-zsh-hook
add-zsh-hook precmd __vibe_precmd
add-zsh-hook preexec __vibe_preexec

# Emit initial prompt marker
__vibe_osc "A"
__vibe_osc "B"  # Ready for input

# Load user's real zshrc if it exists (preserves their customizations)
if [[ -n "$VIBE_USER_ZDOTDIR" && -f "$VIBE_USER_ZDOTDIR/.zshrc" ]]; then
    source "$VIBE_USER_ZDOTDIR/.zshrc"
fi
