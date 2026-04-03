import { Routes, Route } from "react-router-dom";
import Sidebar from "@/components/Sidebar.js";
import ConversationView from "./ConversationView.js";
import styles from "./MainLayout.module.css";

export default function MainLayout() {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <Routes>
          <Route index element={<div className={styles.empty}>Sélectionne une conversation</div>} />
          <Route path="conversations/:id" element={<ConversationView />} />
        </Routes>
      </main>
    </div>
  );
}
