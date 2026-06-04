import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Trash2, EyeOff, MoreVertical, Reply, Forward } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface MessageContextMenuProps {
  messageId: string;
  messageType: "dm";
  isSender: boolean;
  messageContent?: string;
  onDeleted?: () => void;
  onHidden?: () => void;
  onReply?: () => void;
  onForward?: () => void;
}

export function MessageContextMenu({ messageId, messageType, isSender, onDeleted, onHidden, onReply, onForward }: MessageContextMenuProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const deleteForEveryone = async () => {
    if (!user) return;
    const { error } = await supabase.from("direct_messages").delete().eq("id", messageId);
    if (error) toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" });
    else { toast({ title: "Удалено для всех" }); onDeleted?.(); }
    setOpen(false);
  };

  const deleteForMe = async () => {
    if (!user) return;
    const { error } = await supabase.from("hidden_messages").insert({
      user_id: user.id, message_type: messageType, message_id: messageId,
    });
    if (error) toast({ title: "Ошибка", description: "Не удалось скрыть", variant: "destructive" });
    else { toast({ title: "Скрыто для вас" }); onHidden?.(); }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="p-1 rounded-md hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100">
        <MoreVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-50 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
            {onReply && <button onClick={() => { onReply(); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50"><Reply className="w-4 h-4" /> Ответить</button>}
            {onForward && <button onClick={() => { onForward(); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50"><Forward className="w-4 h-4" /> Переслать</button>}
            <button onClick={deleteForMe} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50"><EyeOff className="w-4 h-4" /> Удалить для меня</button>
            {isSender && <button onClick={deleteForEveryone} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /> Удалить для всех</button>}
          </div>
        </>
      )}
    </div>
  );
}
