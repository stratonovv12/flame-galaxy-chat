import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  username?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-20 h-20 text-xl",
};

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getColorFromName(name?: string | null): string {
  if (!name) return "hsl(var(--primary))";
  
  // Generate a consistent hue based on the name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
}

export function UserAvatar({ username, avatarUrl, size = "md", className }: UserAvatarProps) {
  const initials = getInitials(username);
  const bgColor = getColorFromName(username);

  return (
    <Avatar className={cn(sizeClasses[size], "shrink-0", className)}>
      {avatarUrl && (
        <AvatarImage src={avatarUrl} alt={username || "Аватар"} />
      )}
      <AvatarFallback
        style={{ backgroundColor: bgColor }}
        className="text-white font-semibold"
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
