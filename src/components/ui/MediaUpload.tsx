import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Image, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface MediaUploadProps {
  onUpload: (url: string) => void;
  className?: string;
}

export function MediaUpload({ onUpload, className }: MediaUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) {
      toast({ title: "Ошибка", description: "Поддерживаются: JPEG, PNG, GIF, WebP, MP4, WebM", variant: "destructive" });
      return;
    }

    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "Ошибка", description: `Максимальный размер: ${isVideo ? "50MB" : "10MB"}`, variant: "destructive" });
      return;
    }

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview("video");
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage.from("media").createSignedUrl(filePath, 60 * 60 * 24 * 365);
      if (urlData?.signedUrl) {
        onUpload(urlData.signedUrl);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Ошибка загрузки", description: error.message, variant: "destructive" });
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const clearPreview = () => {
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />
      {preview && preview !== "video" && (
        <div className="relative mb-2 inline-block">
          <img src={preview} alt="Preview" className="max-h-32 rounded-lg object-cover" />
          <button
            onClick={clearPreview}
            className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {preview === "video" && (
        <div className="relative mb-2 inline-block px-3 py-2 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          🎥 Видео выбрано
          <button
            onClick={clearPreview}
            className="ml-2 text-destructive"
          >
            <X className="w-3 h-3 inline" />
          </button>
        </div>
      )}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="p-2 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground hover:text-foreground touch-target"
      >
        {uploading ? (
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Image className="w-5 h-5" />
        )}
      </button>
    </div>
  );
}
