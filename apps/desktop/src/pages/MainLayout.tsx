import { Routes, Route } from "react-router-dom";

// Phase 3+ : Sidebar + ConversationView
export default function MainLayout() {
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <aside style={{ width: 240, background: "var(--color-surface)", borderRight: "1px solid var(--color-border)" }}>
        {/* Sidebar — Phase 3 */}
        <p style={{ padding: "1rem", color: "var(--color-text-muted)" }}>Conversations — Phase 3</p>
      </aside>

      <main style={{ flex: 1, overflow: "hidden" }}>
        <Routes>
          <Route index element={<div style={{ padding: "2rem" }}>Sélectionne une conversation</div>} />
          {/* Phase 3+ : /conversations/:id */}
        </Routes>
      </main>
    </div>
  );
}
