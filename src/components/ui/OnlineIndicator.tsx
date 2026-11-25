import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { useLanguage } from "@/contexts/LanguageContext";

interface OnlineIndicatorProps {
  userId: string;
  showText?: boolean;
  className?: string;
}

export function OnlineIndicator({ userId, showText = false, className }: OnlineIndicatorProps) {
  const { is_online, last_seen } = useOnlineStatus(userId);
  const { lang } = useLanguage();

  if (showText) {
    return (
      <span className={`block min-w-0 truncate text-xs ${is_online ? "text-success" : "text-muted-foreground"} ${className || ""}`}>
        {is_online ? (lang === "ru" ? "В сети" : "Online") : last_seen ? `${lang === "ru" ? "был(а)" : "Last seen"} ${formatDistanceToNow(new Date(last_seen), { addSuffix: true, locale: lang === "ru" ? ru : enUS })}` : ""}
      </span>
    );
  }

  if (!is_online) return null;

  return (
    <div className={`w-3 h-3 rounded-full bg-success border-2 border-background ${className || ""}`} />
  );
}
