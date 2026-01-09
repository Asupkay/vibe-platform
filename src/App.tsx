import { useState, useEffect, useRef } from "react";
import Terminal from "./components/Terminal";
import SessionsDrawer from "./components/SessionsDrawer";

function App() {
  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  const terminalRef = useRef<any>(null);

  const handleReplaySession = (sessionId: string, speed: "instant" | "2x" | "realtime", fromTimestamp?: number) => {
    if (terminalRef.current?.replaySession) {
      terminalRef.current.replaySession(sessionId, speed, fromTimestamp);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+S (Mac) or Ctrl+Shift+S (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        setIsSessionsDrawerOpen((prev) => !prev);
      }
      // Escape to close
      if (e.key === "Escape" && isSessionsDrawerOpen) {
        setIsSessionsDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSessionsDrawerOpen]);

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex" }}>
      {/* Terminal (80%) */}
      <div style={{ flex: 1 }}>
        <Terminal ref={terminalRef} />
      </div>

      {/* Social Sidebar (20%) - placeholder for now */}
      <div
        style={{
          width: "300px",
          background: "#0a0a0a",
          borderLeft: "1px solid #222",
          padding: "16px",
        }}
      >
        <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
          Social
        </h3>
        <p style={{ fontSize: "12px", color: "#666" }}>
          Presence, messages, and games coming soon...
        </p>
        <p style={{ fontSize: "11px", color: "#444", marginTop: "16px" }}>
          Press Cmd+Shift+S to view sessions
        </p>
      </div>

      {/* Sessions Drawer */}
      <SessionsDrawer
        isOpen={isSessionsDrawerOpen}
        onClose={() => setIsSessionsDrawerOpen(false)}
        onReplaySession={handleReplaySession}
      />
    </div>
  );
}

export default App;
