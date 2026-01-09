import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

interface Command {
  id: string;
  session_id: string;
  input: string | null;
  exit_code: number | null;
  started_at: number;
  ended_at: number | null;
}

interface SessionSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  cwd: string;
  shell: string;
  command_count: number;
  commands: Command[];
}

interface SessionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onReplaySession: (sessionId: string, speed: "instant" | "2x" | "realtime", fromTimestamp?: number) => void;
}

export default function SessionsDrawer({ isOpen, onClose, onReplaySession }: SessionsDrawerProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionCommands, setSessionCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<"instant" | "2x" | "realtime">("2x");

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await invoke<SessionSummary[]>("get_sessions_with_commands", { limit: 50 });
      setSessions(data);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCommands = async (sessionId: string) => {
    try {
      const data = await invoke<Command[]>("get_commands", { sessionId });
      setSessionCommands(data);
      setSelectedSession(sessionId);
    } catch (error) {
      console.error("Failed to load commands:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatDuration = (started: string, ended: string | null) => {
    const start = new Date(started);
    const end = ended ? new Date(ended) : new Date();
    const diff = end.getTime() - start.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const handleExport = async () => {
    if (!selectedSession) return;

    try {
      // Get JSON from backend
      const json = await invoke<string>("export_session_json", { sessionId: selectedSession });

      // Use Tauri save dialog
      const { save } = await import("@tauri-apps/api/dialog");
      const filePath = await save({
        defaultPath: `session-${selectedSession.slice(0, 8)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (filePath) {
        // Write file
        const { writeTextFile } = await import("@tauri-apps/api/fs");
        await writeTextFile(filePath, json);
        console.log("Session exported to:", filePath);
      }
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "400px",
        background: "#1a1a1a",
        borderLeft: "1px solid #333",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        color: "#fff",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #333",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Sessions</h2>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: "24px",
            cursor: "pointer",
            padding: "0 8px",
          }}
        >
          ×
        </button>
      </div>

      {/* Sessions List */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
        {loading ? (
          <div style={{ padding: "16px", textAlign: "center", color: "#888" }}>Loading...</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: "16px", textAlign: "center", color: "#888" }}>
            No sessions yet. Run some commands!
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => loadCommands(session.id)}
              style={{
                background: selectedSession === session.id ? "#2a2a2a" : "#222",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "8px",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                if (selectedSession !== session.id) {
                  e.currentTarget.style.background = "#252525";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedSession !== session.id) {
                  e.currentTarget.style.background = "#222";
                }
              }}
            >
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
                {formatDate(session.started_at)}
              </div>
              <div style={{ fontSize: "14px", marginBottom: "4px" }}>
                {session.cwd.split("/").slice(-2).join("/")}
              </div>
              <div style={{ fontSize: "12px", color: "#666", display: "flex", gap: "12px" }}>
                <span>{session.command_count} commands</span>
                <span>{formatDuration(session.started_at, session.ended_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Commands Panel (shown when session selected) */}
      {selectedSession && sessionCommands.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #333",
            background: "#1e1e1e",
            maxHeight: "300px",
            overflow: "auto",
          }}
        >
          <div
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              borderBottom: "1px solid #333",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Commands</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* Speed controls */}
              <select
                value={replaySpeed}
                onChange={(e) => setReplaySpeed(e.target.value as any)}
                style={{
                  background: "#2a2a2a",
                  color: "#fff",
                  border: "1px solid #444",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <option value="instant">Instant</option>
                <option value="2x">2x Speed</option>
                <option value="realtime">Realtime</option>
              </select>
              {/* Export button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport();
                }}
                style={{
                  background: "#2a2a2a",
                  color: "#fff",
                  border: "1px solid #444",
                  borderRadius: "4px",
                  padding: "4px 12px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: 600,
                  position: "relative",
                  zIndex: 10,
                }}
                title="Export session as JSON"
              >
                Export
              </button>
              {/* Replay button */}
              <button
                onClick={() => {
                  if (selectedSession) {
                    onReplaySession(selectedSession, replaySpeed);
                    onClose();
                  }
                }}
                style={{
                  background: "#6B8FFF",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 12px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Replay
              </button>
            </div>
          </div>
          {sessionCommands.map((cmd, index) => (
            <div
              key={cmd.id}
              onClick={() => {
                if (selectedSession) {
                  onReplaySession(selectedSession, replaySpeed, cmd.started_at);
                  onClose();
                }
              }}
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid #2a2a2a",
                fontSize: "12px",
                fontFamily: "'SF Mono', monospace",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#252525";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              title={`Click to replay from command ${index + 1}`}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {cmd.exit_code === 0 ? (
                  <span style={{ color: "#50fa7b" }}>✓</span>
                ) : cmd.exit_code !== null ? (
                  <span style={{ color: "#ff5555" }}>✗</span>
                ) : (
                  <span style={{ color: "#888" }}>○</span>
                )}
                <span>{cmd.input || "(no command)"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
