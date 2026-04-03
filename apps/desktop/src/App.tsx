import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store.js";
import LoginPage    from "@/pages/LoginPage.js";
import RegisterPage from "@/pages/RegisterPage.js";
import MainLayout   from "@/pages/MainLayout.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route
            path="/register"
            element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />}
          />
          <Route
            path="/*"
            element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
