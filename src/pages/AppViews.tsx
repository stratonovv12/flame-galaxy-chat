import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { FeedView } from "@/components/views/FeedView";
import { DirectMessagesView } from "@/components/views/DirectMessagesView";
import { AIView } from "@/components/views/AIView";
import { ProfileView } from "@/components/views/ProfileView";
import { UserProfileView } from "@/components/views/UserProfileView";
import { SearchView } from "@/components/views/SearchView";
import { MiniAppsView } from "@/components/views/MiniAppsView";
import { FigurinesView } from "@/components/views/FigurinesView";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

export function AppView({ view }: { view: string }) {
  const navigate = useNavigate();
  const { id, username } = useParams();
  const { search, setSearch } = useOutletContext<{ search: string; setSearch: (value: string) => void }>();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    supabase.from("profiles").select("user_id").eq("username", username.replace(/^@/, "").toLowerCase()).maybeSingle().then(({ data }) => {
      if (!cancelled) { setProfileId(data?.user_id ?? null); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [username]);
  const onProfile = (userId: string) => navigate(`/users/${userId}`);
  if (view === "feed") return <FeedView onViewProfile={onProfile} />;
  if (view === "chats") return <div className="h-full min-h-0"><DirectMessagesView selectedUserId={id} onClearSelectedUser={() => navigate("/chats")} onViewProfile={onProfile} /></div>;
  if (view === "ai") return <div className="h-full min-h-0"><AIView /></div>;
  if (view === "search") return <SearchView searchQuery={search} onSearchChange={setSearch} onStartChat={userId => navigate(`/chats/${userId}`)} onViewProfile={onProfile} />;
  if (view === "marketplace") return <FigurinesView open onOpenChange={open => { if (!open) navigate("/"); }} embedded />;
  if (view === "workshop") return <MiniAppsView open onOpenChange={open => { if (!open) navigate("/"); }} embedded />;
  if (view === "profile" || view === "settings") return <ProfileView settingsInitiallyOpen={view === "settings"} onNavigate={tab => navigate(`/${tab}`)} />;
  if (loading) return <div className="p-8 text-center text-muted-foreground">{t("loading")}</div>;
  const userId = username ? profileId : id;
  if (!userId) return <div className="p-8 text-center text-muted-foreground">{t("profileNotFound")}</div>;
  return <UserProfileView userId={userId} onBack={() => navigate("/")} onStartChat={target => navigate(`/chats/${target}`)} />;
}