import { useState } from "react";
import { Navigate } from "react-router-dom";
import { usePresence } from "@/hooks/usePresence";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav, type BottomTab } from "@/components/layout/BottomNav";
import { FeedView } from "@/components/views/FeedView";
import { DirectMessagesView } from "@/components/views/DirectMessagesView";
import { SearchView } from "@/components/views/SearchView";
import { AIView } from "@/components/views/AIView";
import { ProfileView } from "@/components/views/ProfileView";
import { UserProfileView } from "@/components/views/UserProfileView";
import { WalletView } from "@/components/views/WalletView";

type Tab = BottomTab | "profile" | "wallet";

const Index = () => {
  const { user, loading, isBanned } = useAuth();
  usePresence();
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChatUserId, setSelectedChatUserId] = useState<string | null>(null);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen cosmic-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (isBanned) return <Navigate to="/banned" replace />;

  const handleViewProfile = (userId: string) => setViewingProfileUserId(userId);
  const handleBackFromProfile = () => setViewingProfileUserId(null);
  const handleStartChatFromProfile = (userId: string) => {
    setViewingProfileUserId(null);
    setSelectedChatUserId(userId);
    setActiveTab("messages");
    setSearchQuery("");
  };
  const handleStartChat = (userId: string) => {
    setSelectedChatUserId(userId);
    setActiveTab("messages");
    setSearchQuery("");
  };

  const renderView = () => {
    if (viewingProfileUserId) {
      return <UserProfileView userId={viewingProfileUserId} onBack={handleBackFromProfile} onStartChat={handleStartChatFromProfile} />;
    }
    switch (activeTab) {
      case "feed": return <FeedView onViewProfile={handleViewProfile} />;
      case "messages": return <DirectMessagesView selectedUserId={selectedChatUserId} onClearSelectedUser={() => setSelectedChatUserId(null)} onViewProfile={handleViewProfile} />;
      case "search": return <SearchView searchQuery={searchQuery} onSearchChange={setSearchQuery} onStartChat={handleStartChat} onViewProfile={handleViewProfile} />;
      case "ai": return <AIView />;
      case "profile": return <ProfileView onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "wallet": return <WalletView />;
      default: return <FeedView onViewProfile={handleViewProfile} />;
    }
  };

  const bottomTab: BottomTab = (activeTab === "profile" || activeTab === "wallet") ? "feed" : activeTab as BottomTab;

  return (
    <div className="min-h-screen cosmic-bg flex flex-col">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={(q) => { setSearchQuery(q); if (q.trim()) setActiveTab("search"); }}
        onOpenWallet={() => { setViewingProfileUserId(null); setActiveTab("wallet"); }}
        onOpenProfile={() => { setViewingProfileUserId(null); setActiveTab("profile"); }}
      />
      <main className="flex-1 pt-[72px] pb-[80px] overflow-hidden">
        <div className="h-full overflow-y-auto custom-scrollbar">{renderView()}</div>
      </main>
      <BottomNav
        activeTab={bottomTab}
        onTabChange={(tab) => { setViewingProfileUserId(null); setActiveTab(tab); }}
      />
    </div>
  );
};

export default Index;
