import { useEffect, useRef } from "react";
import { Home, MessageCircle, Flame, Store, Code2, User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { useDockContacts } from "@/hooks/useDockContacts";
import { APP_TABS, type AppTab } from "@/lib/navigation";

export type BottomTab = AppTab;

interface BottomNavProps {
  activeTab: BottomTab | null;
  onTabChange: (tab: BottomTab) => void;
  onContactClick: (userId: string) => void;
}

export function BottomNav({ activeTab, onTabChange, onContactClick }: BottomNavProps) {
  const { t } = useLanguage();
  const { contacts, unread } = useDockContacts();
  const track = useRef<HTMLDivElement>(null);
  const icons = { feed: Home, messages: MessageCircle, ai: Flame, marketplace: Store, workshop: Code2, profile: User, settings: Settings };
  const labels = { feed: t("feed"), messages: t("chats"), ai: "AI", marketplace: t("marketplace"), workshop: t("workshop"), profile: t("profile"), settings: t("settings") };
  useEffect(() => {
    const el = track.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    const container = track.current;
    if (el && container) {
      const left = el.offsetLeft;
      if (left < container.scrollLeft || left + el.offsetWidth > container.scrollLeft + container.clientWidth) {
        container.scrollTo({ left, behavior: "smooth" });
      }
    }
  }, [activeTab]);

  return (
    <nav className="navigation-dock" aria-label={t("navigation")}>
      <div ref={track} className="dock-track">
        {APP_TABS.map(tab => {
          const Icon = icons[tab];
          const isActive = activeTab === tab;
          return (
            <Button key={tab} data-tab={tab} variant="ghost" onClick={() => onTabChange(tab)} aria-current={isActive ? "page" : undefined}
              className={cn("dock-slot h-[64px] rounded-none flex flex-col gap-1 px-1 hover:bg-muted/50",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
              <div className="relative">
                <Icon className="!w-5 !h-5" />
                {tab === "messages" && unread > 0 && (
                  <span className="absolute -top-2 -right-3 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] px-1">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-4 truncate max-w-full">{labels[tab]}</span>
            </Button>
          );
        })}
        {contacts.map(contact => (
          <Button key={contact.user_id} variant="ghost" className="dock-slot h-[64px] rounded-none flex flex-col gap-0.5 px-1" onClick={() => onContactClick(contact.user_id)}>
            <span className="relative w-8 h-8">
              {contact.avatar_url ? <img src={contact.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">{(contact.display_name || contact.username || "?").charAt(0).toUpperCase()}</span>}
              {contact.online && <span className="absolute right-0 bottom-0 w-2 h-2 rounded-full bg-success border-2 border-card" />}
            </span>
            <span className="text-[10px] leading-4 truncate max-w-full">{(contact.display_name || contact.username || t("user")).split(" ")[0]}</span>
          </Button>
        ))}
      </div>
    </nav>
  );
}
