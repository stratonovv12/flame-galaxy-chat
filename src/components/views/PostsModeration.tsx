import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { parseRich, RichContent } from "@/components/ui/RichContent";
import { Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ModeratedPost { id: string; table: "feed_posts" | "profile_items"; content: string | null; media_url: string | null; media_type?: string | null; created_at: string; author: { username: string | null; avatar_url: string | null; display_name: string | null } | null; }
export function PostsModeration() {
  const { isAdmin } = useAuth();
  const { t, lang } = useLanguage();
  const [posts, setPosts] = useState<ModeratedPost[]>([]);
  const [limit, setLimit] = useState(30);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ModeratedPost | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      const [feed, profile] = await Promise.all([
        supabase.from("feed_posts").select("*").order("created_at", { ascending: false }).limit(limit + 1),
        supabase.from("profile_items").select("*").order("created_at", { ascending: false }).limit(limit + 1),
      ]);
      if (feed.error || profile.error) { toast({ title: t("error"), description: feed.error?.message || profile.error?.message, variant: "destructive" }); setLoading(false); return; }
      const rows = [...(feed.data ?? []).map(p => ({ ...p, authorId: p.author_id, table: "feed_posts" as const })), ...(profile.data ?? []).map(p => ({ ...p, authorId: p.user_id, table: "profile_items" as const }))].sort((a,b) => b.created_at.localeCompare(a.created_at));
      const ids = [...new Set(rows.map(p => p.authorId))];
      const { data: authors } = ids.length ? await supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", ids) : { data: [] };
      const map = new Map((authors ?? []).map(a => [a.user_id, a]));
      if (!cancelled) { setPosts(rows.slice(0, limit).map(p => ({ ...p, author: map.get(p.authorId) ?? null }))); setMore(rows.length > limit); setLoading(false); }
    };
    void load();
    const channel = supabase.channel(`moderation-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_items" }, () => void load()).subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [isAdmin, limit, t]);
  const remove = async () => {
    if (!selected || !isAdmin) return;
    setDeleting(true);
    const { data, error } = await supabase.from(selected.table).delete().eq("id", selected.id).select("id");
    setDeleting(false);
    if (error || !data?.length) { toast({ title: t("error"), description: error?.message || t("postNotFound"), variant: "destructive" }); return; }
    setPosts(previous => previous.filter(p => p.id !== selected.id)); setSelected(null);
    window.dispatchEvent(new Event("flame-posts-changed"));
    toast({ title: t("moderationDeleted") });
  };
  if (!isAdmin) return null;
  return <section className="space-y-3 border-t border-border pt-5">
    <h3 className="font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />{t("postsModeration")}</h3>
    {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : !posts.length ? <p className="text-sm text-muted-foreground">{t("moderationEmpty")}</p> : posts.map(post => {
      const doc = post.content ? parseRich(post.content) : null;
      return <article key={`${post.table}-${post.id}`} className="border border-border bg-card rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2">
          <UserAvatar username={post.author?.username ?? null} avatarUrl={post.author?.avatar_url ?? null} size="sm" />
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{post.author?.display_name || post.author?.username || t("user")}</p><p className="text-xs text-muted-foreground">@{post.author?.username || "—"}</p></div>
          <time className="text-[10px] text-muted-foreground">{new Date(post.created_at).toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</time>
        </div>
        {doc ? <RichContent doc={doc} compact /> : <p className="text-sm whitespace-pre-wrap break-words">{post.content}</p>}
        {post.media_url && (post.media_type === "video" ? <video src={post.media_url} controls playsInline className="max-h-48 rounded-lg" /> : <img src={post.media_url.split(",")[0]} alt="" className="max-h-48 rounded-lg object-contain" />)}
        <Button variant="destructive" size="sm" onClick={() => setSelected(post)}><Trash2 />{t("moderationDelete")}</Button>
      </article>;
    })}
    {more && <Button variant="outline" onClick={() => setLimit(previous => previous + 30)}>{t("moderationLoadMore")}</Button>}
    <AlertDialog open={!!selected} onOpenChange={open => { if (!open && !deleting) setSelected(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("moderationDelete")}</AlertDialogTitle><AlertDialogDescription>{t("deletePostConfirm")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel><Button variant="destructive" disabled={deleting} onClick={() => void remove()}>{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}{t("delete")}</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}