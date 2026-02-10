import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame, BadgeCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UserBadgeProps {
  userId: string;
  className?: string;
}

// Cache roles to avoid repeated queries
const roleCache = new Map<string, string[]>();

export function UserBadge({ userId, className }: UserBadgeProps) {
  const [roles, setRoles] = useState<string[]>(roleCache.get(userId) || []);

  useEffect(() => {
    if (roleCache.has(userId)) {
      setRoles(roleCache.get(userId)!);
      return;
    }

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => {
        const r = data?.map((d) => d.role) || [];
        roleCache.set(userId, r);
        setRoles(r);
      });
  }, [userId]);

  if (!roles.includes("admin")) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-0.5 ${className || ""}`}>
          <BadgeCheck className="w-4 h-4 text-blue-400 fill-blue-400/20" />
          <Flame className="w-3.5 h-3.5 text-primary" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Official FLAME Founder</p>
      </TooltipContent>
    </Tooltip>
  );
}
