import { Hash, Users, Sparkles, User, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type TabType = "channels" | "search" | "ai" | "profile";

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  { id: "channels" as const, label: "Каналы", icon: Hash },
  { id: "search" as const, label: "Поиск", icon: Search },
  { id: "ai" as const, label: "FLAME AI", icon: Sparkles },
  { id: "profile" as const, label: "Профиль", icon: User },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card rounded-none border-t border-border/50 pb-safe">
      <div className="flex items-stretch justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-3 px-2 touch-target",
                "transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "relative p-2 rounded-xl transition-all duration-200",
                isActive && "bg-primary/20"
              )}>
                <Icon className={cn(
                  "w-6 h-6 transition-all",
                  isActive && "text-glow"
                )} />
                {isActive && (
                  <div className="absolute inset-0 bg-primary/20 rounded-xl blur-md -z-10" />
                )}
              </div>
              <span className={cn(
                "text-xs mt-1 font-medium",
                isActive && "text-primary"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
