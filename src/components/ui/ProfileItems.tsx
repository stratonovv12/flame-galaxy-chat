import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { RichContent, parseRich } from "@/components/ui/RichContent";
import { RichComposer } from "@/components/ui/RichComposer";
import { PostComposer, SimplePost } from "@/components/ui/PostComposer";
import { useLanguage } from "@/contexts/LanguageContext";
import { encodeRich } from "@/components/ui/RichContent";
import { Pin, PinOff, Archive, ArchiveRestore, Trash2, Plus, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface ProfileItem {
  id: string;
  user_id: string;
  kind: string;
  title: string | null;
  content: string;
  media_url: string | null;
  pinned: boolean;
  archived: boolean;
  created_at: string;
}

interface Props {
  userId: string;
  /** Owner controls (pin / archive / delete / create) */
  editable?: boolean;
}

/** Rich presentations & standalone posts published on a profile. */
export function ProfileItems({ userId, editable }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<ProfileItem[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const { t } = useLanguage();
  const isOwner = editable && user?.id === userId;

  useEffect(() => { load(); }, [userId, showArchived]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("flame-posts-changed", refresh);
    const channel = supabase.channel(`profile-posts-${userId}-${crypto.randomUUID()}`).on("postgres_changes", { event: "*", schema: "public", table: "profile_items", filter: `user_id=eq.${userId}` }, refresh).subscribe();
    return () => { window.removeEventListener("flame-posts-changed", refresh); void supabase.removeChannel(channel); };
  }, [userId, showArchived]);

  const load = async () => {
    let q = supabase.from("profile_items").select("*").eq("user_id", userId);
    q = isOwner && showArchived ? q.eq("archived", true) : q.eq("archived", false);
    const { data } = await q.order("pinned", { ascending: false }).order("created_at", { ascending: false });
    setItems((data as ProfileItem[]) || []);
  };

  const publish = async (md: string, bg?: string, color?: string, font?: string) => {
    if (!user) return;
    const { error } = await supabase.from("profile_items").insert({
      user_id: user.id,
      kind: "presentation",
      content: encodeRich({ md, bg, color, font }),
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Published to your profile" });
    load();
  };

  /** Simple post: text plus optional photos/videos. */
  const publishSimple = async (post: SimplePost) => {
    if (!user) return;
    const images = post.media.filter(m => m.type === "image").map(m => `![](${m.url})`).join("\n");
    const videos = post.media.filter(m => m.type === "video").map(m => m.url);
    const { error } = await supabase.from("profile_items").insert({
      user_id: user.id,
      kind: "post",
      content: encodeRich({ md: [post.text, images].filter(Boolean).join("\n\n") || " " }),
      media_url: videos.length ? videos.join(",") : null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Published to your profile" });
    load();
  };

  const togglePin = async (it: ProfileItem) => {
    await supabase.from("profile_items").update({ pinned: !it.pinned }).eq("id", it.id);
    load();
  };
  const toggleArchive = async (it: ProfileItem) => {
    await supabase.from("profile_items").update({ archived: !it.archived }).eq("id", it.id);
    load();
  };
  const remove = async (it: ProfileItem) => {
    if (!confirm("Delete this permanently?")) return;
    await supabase.from("profile_items").delete().eq("id", it.id);
    setItems(prev => prev.filter(x => x.id !== it.id));
  };

  return (
    <div className="space-y-3">
      {isOwner && (
        <div className="flex gap-2">
          <FlameButton onClick={() => setPostOpen(true)} className="flex-1" size="sm">
            <Plus className="w-4 h-4 mr-2" />{t("createPost")}
          </FlameButton>
          <FlameButton variant="outline" size="sm" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </FlameButton>
        </div>
      )}

      {items.length === 0 ? (
        <GlassCard className="text-center py-8">
          <FileText className="w-10 h-10 mx-auto mb-2 text-primary/50" />
          <p className="text-sm text-muted-foreground">{showArchived ? "Nothing archived." : "No posts yet."}</p>
        </GlassCard>
      ) : items.map(it => {
        const doc = parseRich(it.content) || { md: it.content };
        return (
          <GlassCard key={it.id} className="p-3 space-y-2">
            {it.pinned && <p className="text-[11px] text-primary flex items-center gap-1"><Pin className="w-3 h-3" /> Pinned</p>}
            <RichContent doc={doc} compact />
            {it.media_url?.split(",").filter(Boolean).map(url => (
              <video key={url} src={url} controls playsInline className="w-full rounded-lg border border-border" />
            ))}
            {isOwner && (
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => togglePin(it)} className="p-2 rounded-lg hover:bg-primary/10 text-primary" title={it.pinned ? "Unpin" : "Pin"}>
                  {it.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
                <button onClick={() => toggleArchive(it)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground" title={it.archived ? "Unarchive" : "Archive"}>
                  {it.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </button>
                <button onClick={() => remove(it)} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </GlassCard>
        );
      })}

      <PostComposer
        open={postOpen}
        onOpenChange={setPostOpen}
        onSubmit={publishSimple}
        onOpenPresentation={() => setComposerOpen(true)}
      />

      <RichComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        title={t("buildPresentation")}
        submitLabel="Publish"
        onSubmit={(doc) => publish(doc.md, doc.bg, doc.color, doc.font)}
      />
    </div>
  );
}
