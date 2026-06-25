import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import RequireSession from "@/components/auth/RequireSession";
import AppShell from "@/components/layout/AppShell";
import RouteFallback from "@/components/ui/RouteFallback";

// Code-splitting: cada página vira um chunk próprio carregado sob demanda.
// Reduz o JS inicial (só Login + shell no primeiro paint).
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const OrderNew = lazy(() => import("@/pages/OrderNew"));
const OrderQueue = lazy(() => import("@/pages/OrderQueue"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Cash = lazy(() => import("@/pages/Cash"));
const FiscalMonitor = lazy(() => import("@/pages/FiscalMonitor"));
const AdminMasterData = lazy(() => import("@/pages/AdminMasterData"));

export default function App() {
  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="/login" element={<Login />} />

          <Route element={<RequireSession />}>
            <Route path="/app" element={<AppShell />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="orders">
                <Route path="new" element={<OrderNew />} />
                <Route path="queue" element={<OrderQueue />} />
              </Route>
              <Route path="inventory" element={<Inventory />} />
              <Route path="finance">
                <Route path="cash" element={<Cash />} />
              </Route>
              <Route path="fiscal">
                <Route path="monitor" element={<FiscalMonitor />} />
              </Route>
              <Route path="admin">
                <Route path="master-data" element={<AdminMasterData />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
