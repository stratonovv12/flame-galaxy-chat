import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface OnlineIndicatorProps {
  userId: string;
  showText?: boolean;
  className?: string;
}

export function OnlineIndicator({ userId, showText = false, className }: OnlineIndicatorProps) {
  const { is_online, last_seen } = useOnlineStatus(userId);

  if (showText) {
    return (
      <span className={`text-xs ${is_online ? "text-green-400" : "text-muted-foreground"} ${className || ""}`}>
        {is_online ? "В сети" : last_seen ? `был(а) ${formatDistanceToNow(new Date(last_seen), { addSuffix: true, locale: ru })}` : ""}
      </span>
    );
  }

  if (!is_online) return null;

  return (
    <div className={`w-3 h-3 rounded-full bg-green-500 border-2 border-background ${className || ""}`} />
  );
}
