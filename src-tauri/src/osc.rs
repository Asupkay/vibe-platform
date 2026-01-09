// OSC (Operating System Command) sequence parser for shell integration
// Parses OSC 133 sequences for command boundary detection

use base64::{Engine as _, engine::general_purpose};

#[derive(Debug, Clone)]
pub enum OscEvent {
    PromptStart,          // OSC 133;A
    CommandStart,         // OSC 133;C
    CommandEnd(i32),      // OSC 133;D;<exit_code>
    CommandText(String),  // OSC 133;VIBE;CMD;<base64>
}

pub struct OscParser {
    state: ParserState,
    buffer: Vec<u8>,
    nonce: String,
}

enum ParserState {
    Normal,
    EscapeStart,     // After ESC
    OscStart,        // After ESC ]
    OscPayload,      // Collecting payload until terminator
}

impl OscParser {
    pub fn new(nonce: String) -> Self {
        Self {
            state: ParserState::Normal,
            buffer: Vec::new(),
            nonce,
        }
    }

    /// Feed bytes and extract any complete OSC events
    pub fn feed(&mut self, data: &[u8]) -> Vec<OscEvent> {
        let mut events = Vec::new();

        for &byte in data {
            match self.state {
                ParserState::Normal => {
                    if byte == 0x1b {
                        // ESC
                        self.state = ParserState::EscapeStart;
                    }
                }
                ParserState::EscapeStart => {
                    if byte == b']' {
                        self.state = ParserState::OscStart;
                        self.buffer.clear();
                    } else {
                        self.state = ParserState::Normal;
                    }
                }
                ParserState::OscStart => {
                    self.buffer.push(byte);
                    self.state = ParserState::OscPayload;
                }
                ParserState::OscPayload => {
                    if byte == 0x07 || (byte == 0x5c && self.buffer.last() == Some(&0x1b)) {
                        // BEL (0x07) or ST (ESC \)
                        if byte == 0x5c {
                            self.buffer.pop(); // Remove ESC from ST
                        }

                        // Parse payload
                        if let Some(event) = self.parse_payload() {
                            events.push(event);
                        }

                        self.buffer.clear();
                        self.state = ParserState::Normal;
                    } else {
                        self.buffer.push(byte);
                    }
                }
            }
        }

        events
    }

    fn parse_payload(&self) -> Option<OscEvent> {
        let payload = String::from_utf8_lossy(&self.buffer);

        // Check if it's an OSC 133 sequence with our nonce
        if !payload.contains(&format!("vibe={}", self.nonce)) {
            return None;
        }

        let parts: Vec<&str> = payload.split(';').collect();
        if parts.len() < 2 || parts[0] != "133" {
            return None;
        }

        match parts[1] {
            "A" => Some(OscEvent::PromptStart),
            "C" => Some(OscEvent::CommandStart),
            part if part.starts_with("D") => {
                // Extract exit code: "D;0" or just "D"
                let exit_code = if let Some(code_str) = part.strip_prefix("D;") {
                    code_str.split(';').next()?.parse().ok()?
                } else if parts.len() > 2 {
                    parts[2].split(';').next()?.parse().ok()?
                } else {
                    0
                };
                Some(OscEvent::CommandEnd(exit_code))
            }
            part if part == "VIBE" && parts.len() > 2 && parts[2] == "CMD" => {
                // Command text: "133;VIBE;CMD;<base64>;vibe=<nonce>"
                if let Some(b64_data) = parts.get(3) {
                    let clean_b64 = b64_data.split(';').next()?;
                    if let Ok(decoded) = general_purpose::STANDARD.decode(clean_b64) {
                        if let Ok(text) = String::from_utf8(decoded) {
                            return Some(OscEvent::CommandText(text));
                        }
                    }
                }
                None
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prompt_start() {
        let mut parser = OscParser::new("test123".to_string());
        let input = b"\x1b]133;A;vibe=test123\x07";
        let events = parser.feed(input);
        assert_eq!(events.len(), 1);
        matches!(events[0], OscEvent::PromptStart);
    }

    #[test]
    fn test_command_end() {
        let mut parser = OscParser::new("test123".to_string());
        let input = b"\x1b]133;D;0;vibe=test123\x07";
        let events = parser.feed(input);
        assert_eq!(events.len(), 1);
        if let OscEvent::CommandEnd(code) = events[0] {
            assert_eq!(code, 0);
        } else {
            panic!("Expected CommandEnd event");
        }
    }
}
