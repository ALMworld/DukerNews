// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title AgentNameValidator
/// @notice Name validation for DUKIGEN agent/works names.
///         Forked from DukerNameValidator with one key difference:
///         **spaces are allowed** (agent names are brand names like "Duker News").
///
///         Rules:
///           - 1-192 bytes (~64 CJK chars or 192 ASCII)
///           - Spaces allowed (single, not leading/trailing, not consecutive)
///           - at-sign forbidden (reserved as fullId delimiter)
///           - No control chars, no SVG/XML injection chars
///           - No zero-width chars, direction overrides, etc.
///           - No Latin+Cyrillic mixing (homoglyph attack prevention)
library AgentNameValidator {
    uint256 internal constant MAX_NAME_BYTES = 192;

    error InvalidAgentName();

    function validate(string memory name) internal pure {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < 1 || len > MAX_NAME_BYTES) revert InvalidAgentName();

        // Reject leading/trailing spaces
        if (uint8(b[0]) == 0x20 || uint8(b[len - 1]) == 0x20) revert InvalidAgentName();

        bool prevSpace;
        bool hasLatin;
        bool hasCyrillic;

        for (uint256 i = 0; i < len; i++) {
            uint8 c = uint8(b[i]);

            // Control characters (0x00-0x1F) — but ALLOW space (0x20)
            if (c < 0x20) revert InvalidAgentName();

            // Reject consecutive spaces ("My  App")
            if (c == 0x20) {
                if (prevSpace) revert InvalidAgentName();
                prevSpace = true;
            } else {
                prevSpace = false;
            }

            // SVG/XML injection chars + @: " & ' < > @
            if (c == 0x22 || c == 0x26 || c == 0x27 || c == 0x3C || c == 0x3E || c == 0x40) revert InvalidAgentName();
            // DEL character
            if (c == 0x7F) revert InvalidAgentName();

            // Track Latin letters
            if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) hasLatin = true;

            // Multi-byte UTF-8 checks
            if (c >= 0x80 && i + 1 < len) {
                uint8 c1 = uint8(b[i + 1]);

                // Track Cyrillic
                if (c >= 0xD0 && c <= 0xD3) hasCyrillic = true;

                // Combining diacritical marks
                if (c == 0xCC) revert InvalidAgentName();
                if (c == 0xCD && c1 <= 0xAF) revert InvalidAgentName();

                // 3-byte sequences
                if (c >= 0xE0 && c <= 0xEF && i + 2 < len) {
                    uint8 c2 = uint8(b[i + 2]);
                    if (c == 0xE2 && (c1 == 0x80 || c1 == 0x81)) revert InvalidAgentName();
                    if (c == 0xE2 && c1 >= 0x91 && c1 <= 0x93) revert InvalidAgentName();
                    if (c == 0xE2 && c1 == 0x82) revert InvalidAgentName();
                    if (c == 0xEF && c1 == 0xAC) revert InvalidAgentName();
                    if (c == 0xEF && c1 == 0xBB && c2 == 0xBF) revert InvalidAgentName();
                    if (c == 0xEF && c1 == 0xB8 && c2 >= 0x80 && c2 <= 0x8F) revert InvalidAgentName();
                    if (c == 0xEF && c1 == 0xB7) revert InvalidAgentName();
                    if (c == 0xEF && c1 == 0xBF && c2 >= 0xB0) revert InvalidAgentName();
                    if (c == 0xEF && (c1 == 0xBC || c1 == 0xBD)) revert InvalidAgentName();
                }

                // Tag characters (4-byte)
                if (c == 0xF3 && c1 == 0xA0) revert InvalidAgentName();
            }
        }

        // Reject Latin + Cyrillic mixing (homoglyph attack prevention)
        if (hasLatin && hasCyrillic) revert InvalidAgentName();
    }
}
