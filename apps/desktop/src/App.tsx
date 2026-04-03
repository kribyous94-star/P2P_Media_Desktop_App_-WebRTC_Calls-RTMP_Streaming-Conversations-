import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store.js";

// Pages (à implémenter dans les phases suivantes)
import LoginPage from "@/pages/LoginPage.js";
import RegisterPage from "@/pages/RegisterPage.js";
import MainLayout from "@/pages/MainLayout.js";

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <BrowserRouter>
      <Routes>
        {/* Routes publiques */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />}
        />

        {/* Routes protégées */}
        <Route
          path="/*"
          element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
