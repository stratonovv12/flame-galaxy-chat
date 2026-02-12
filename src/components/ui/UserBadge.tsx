import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame, BadgeCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UserBadgeProps {
  userId: string;
  className?: string;
}

// Cache for roles and verified status
const roleCache = new Map<string, string[]>();
const verifiedCache = new Map<string, boolean>();

export function UserBadge({ userId, className }: UserBadgeProps) {
  const [roles, setRoles] = useState<string[]>(roleCache.get(userId) || []);
  const [verified, setVerified] = useState<boolean>(verifiedCache.get(userId) || false);

  useEffect(() => {
    if (!roleCache.has(userId)) {
      supabase.from("user_roles").select("role").eq("user_id", userId).then(({ data }) => {
        const r = data?.map((d) => d.role) || [];
        roleCache.set(userId, r);
        setRoles(r);
      });
    }

    if (!verifiedCache.has(userId)) {
      supabase.from("verified_users").select("id").eq("user_id", userId).maybeSingle().then(({ data }) => {
        const v = !!data;
        verifiedCache.set(userId, v);
        setVerified(v);
      });
    }
  }, [userId]);

  const isAdmin = roles.includes("admin");
  const isVerified = verified;

  if (!isAdmin && !isVerified) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className || ""}`}>
      {isVerified && (
        <Tooltip>
          <TooltipTrigger asChild>
            <BadgeCheck className="w-4 h-4 text-blue-400 fill-blue-400/20" />
          </TooltipTrigger>
          <TooltipContent><p className="text-xs">Верифицирован</p></TooltipContent>
        </Tooltip>
      )}
      {isAdmin && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Flame className="w-3.5 h-3.5 text-primary" />
          </TooltipTrigger>
          <TooltipContent><p className="text-xs">Official FLAME Founder</p></TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

// Export for cache invalidation
export function invalidateUserBadgeCache(userId: string) {
  verifiedCache.delete(userId);
  roleCache.delete(userId);
}
