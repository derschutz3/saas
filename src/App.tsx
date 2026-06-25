import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "@/pages/Login";
import RequireSession from "@/components/auth/RequireSession";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "@/pages/Dashboard";
import Reports from "@/pages/Reports";
import OrderNew from "@/pages/OrderNew";
import OrderQueue from "@/pages/OrderQueue";
import Inventory from "@/pages/Inventory";
import Cash from "@/pages/Cash";
import FiscalMonitor from "@/pages/FiscalMonitor";
import AdminMasterData from "@/pages/AdminMasterData";
import { Navigate } from "react-router-dom";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="/login" element={<Login />} />

        <Route element={<RequireSession />}>
          <Route path="/app" element={<AppShell />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="reports" element={<Reports />} />
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
    </Router>
  );
}
