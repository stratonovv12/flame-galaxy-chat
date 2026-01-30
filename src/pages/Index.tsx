import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ChannelsView } from "@/components/views/ChannelsView";
import { SearchView } from "@/components/views/SearchView";
import { AIView } from "@/components/views/AIView";
import { ProfileView } from "@/components/views/ProfileView";

type TabType = "channels" | "search" | "ai" | "profile";

const Index = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("channels");
  const [searchQuery, setSearchQuery] = useState("");

  if (loading) {
    return (
      <div className="min-h-screen cosmic-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const renderView = () => {
    switch (activeTab) {
      case "channels":
        return <ChannelsView />;
      case "search":
        return <SearchView searchQuery={searchQuery} onSearchChange={setSearchQuery} />;
      case "ai":
        return <AIView />;
      case "profile":
        return <ProfileView />;
      default:
        return <ChannelsView />;
    }
  };

  return (
    <div className="min-h-screen cosmic-bg flex flex-col">
      <TopBar searchQuery={searchQuery} onSearchChange={(q) => {
        setSearchQuery(q);
        if (q.trim()) setActiveTab("search");
      }} />
      
      <main className="flex-1 pt-[72px] pb-[80px] overflow-hidden">
        <div className="h-full overflow-y-auto custom-scrollbar">
          {renderView()}
        </div>
      </main>
      
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
