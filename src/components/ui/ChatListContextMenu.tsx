import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Trash2, ShieldBan } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ChatListContextMenuProps {
  children: React.ReactNode;
  partnerId: string;
  partnerUsername: string | null;
  onDeleted?: () => void;
}

export function ChatListContextMenu({ children, partnerId, partnerUsername, onDeleted }: ChatListContextMenuProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMenu = useCallback((x: number, y: number) => {
    setPos({ x, y });
    setOpen(true);
  }, []);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      showMenu(touch.clientX, touch.clientY);
    }, 500);
  };

  const onTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const deleteConversation = async () => {
    if (!user) return;
    await supabase.from("direct_messages").delete()
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`);
    toast({ title: "Чат удалён" });
    onDeleted?.();
    setOpen(false);
  };

  const deleteAndBlock = async () => {
    if (!user) return;
    await supabase.from("direct_messages").delete()
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`);
    await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: partnerId });
    toast({ title: `${partnerUsername || "Пользователь"} заблокирован` });
    onDeleted?.();
    setOpen(false);
  };

  return (
    <div onContextMenu={onContextMenu} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd}>
      {children}
      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
            style={{ top: pos.y, left: Math.min(pos.x, window.innerWidth - 220) }}
          >
            <button
              onClick={deleteConversation}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Удалить чат
            </button>
            <button
              onClick={deleteAndBlock}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <ShieldBan className="w-4 h-4" /> Удалить и заблокировать
            </button>
          </div>
        </>
      )}
    </div>
  );
}
