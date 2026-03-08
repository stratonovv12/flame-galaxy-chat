import { useState } from "react";
import { Navigate } from "react-router-dom";
import { usePresence } from "@/hooks/usePresence";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ChannelsView } from "@/components/views/ChannelsView";
import { GroupsView } from "@/components/views/GroupsView";
import { DirectMessagesView } from "@/components/views/DirectMessagesView";
import { SearchView } from "@/components/views/SearchView";
import { AIView } from "@/components/views/AIView";
import { ProfileView } from "@/components/views/ProfileView";
import { UserProfileView } from "@/components/views/UserProfileView";
import { MarketplaceView } from "@/components/views/MarketplaceView";
import { InventoryView } from "@/components/views/InventoryView";
import { WalletView } from "@/components/views/WalletView";
import { TradeOffersView } from "@/components/views/TradeOffersView";

type TabType = "channels" | "groups" | "messages" | "search" | "ai" | "profile" | "market" | "inventory" | "wallet" | "trades";

const Index = () => {
  const { user, loading, isBanned } = useAuth();
  usePresence();
  const [activeTab, setActiveTab] = useState<TabType>("channels");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChatUserId, setSelectedChatUserId] = useState<string | null>(null);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);

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
  const handleOpenGroup = (groupId: string) => {
    setOpenGroupId(groupId);
    setActiveTab("groups");
    setSearchQuery("");
  };
  const handleOpenChannel = (channelId: string) => {
    setOpenChannelId(channelId);
    setActiveTab("channels");
    setSearchQuery("");
  };

  const renderView = () => {
    if (viewingProfileUserId) {
      return <UserProfileView userId={viewingProfileUserId} onBack={handleBackFromProfile} onStartChat={handleStartChatFromProfile} />;
    }
    switch (activeTab) {
      case "channels": return <ChannelsView onViewProfile={handleViewProfile} initialChannelId={openChannelId} onClearInitial={() => setOpenChannelId(null)} />;
      case "groups": return <GroupsView onViewProfile={handleViewProfile} initialGroupId={openGroupId} onClearInitial={() => setOpenGroupId(null)} />;
      case "messages": return <DirectMessagesView selectedUserId={selectedChatUserId} onClearSelectedUser={() => setSelectedChatUserId(null)} onViewProfile={handleViewProfile} />;
      case "search": return <SearchView searchQuery={searchQuery} onSearchChange={setSearchQuery} onStartChat={handleStartChat} onViewProfile={handleViewProfile} onOpenChannel={handleOpenChannel} onOpenGroup={handleOpenGroup} />;
      case "ai": return <AIView />;
      case "profile": return <ProfileView />;
      case "market": return <MarketplaceView />;
      case "inventory": return <InventoryView />;
      case "wallet": return <WalletView />;
      case "trades": return <TradeOffersView />;
      default: return <ChannelsView onViewProfile={handleViewProfile} />;
    }
  };

  return (
    <div className="min-h-screen cosmic-bg flex flex-col">
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={(q) => { setSearchQuery(q); if (q.trim()) setActiveTab("search"); }}
        onOpenMarketplace={() => setActiveTab("market")}
        onOpenProfile={() => setActiveTab("profile")}
      />
      <main className="flex-1 pt-[72px] pb-[80px] overflow-hidden">
        <div className="h-full overflow-y-auto custom-scrollbar">
          {renderView()}
        </div>
      </main>
      <BottomNav activeTab={activeTab === "market" || activeTab === "inventory" || activeTab === "wallet" || activeTab === "trades" ? "channels" : activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
