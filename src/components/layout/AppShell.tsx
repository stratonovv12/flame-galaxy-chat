import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePresence } from "@/hooks/usePresence";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { getActiveTab, tabPaths } from "@/lib/navigation";
import { CallingProvider } from "@/contexts/CallingContext";

export function AppShell() {
  const { user, loading, isBanned } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  usePresence();
  useEffect(() => { if (location.pathname !== "/search") setSearch(""); }, [location.pathname]);
  if (loading) return <div className="app-shell items-center justify-center"><div role="status" className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;
  if (isBanned) return <Navigate to="/banned" replace />;
  if (!user) return <Navigate to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return (
    <CallingProvider>
      <div className="app-shell">
        <TopBar searchQuery={search} onSearchChange={value => { setSearch(value); if (location.pathname !== "/search") navigate("/search"); }} onOpenSearch={() => { if (location.pathname !== "/search") navigate("/search"); }} onOpenProfile={() => navigate("/profile")} />
        <main key={location.pathname} className="app-main flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-none custom-scrollbar">
          <Outlet context={{ search, setSearch }} />
        </main>
        <BottomNav activeTab={getActiveTab(location.pathname)} onTabChange={tab => navigate(tabPaths[tab])} onContactClick={id => navigate(`/chats/${id}`)} />
      </div>
    </CallingProvider>
  );
}