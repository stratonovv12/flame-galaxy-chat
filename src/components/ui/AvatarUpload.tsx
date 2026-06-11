import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FlameButton } from "@/components/ui/FlameButton";
import { Camera, Upload, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AvatarUploadProps {
  onUpload: (url: string) => void;
  currentUrl?: string;
  /** Subfolder in the avatars bucket (e.g. "channels") */
  folder?: string;
  className?: string;
}

export function AvatarUpload({ onUpload, currentUrl, folder, className }: AvatarUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Max file size is 5MB", variant: "destructive" });
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const basePath = folder ? `${user.id}/${folder}` : user.id;
      const filePath = `${basePath}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      onUpload(publicUrlData.publicUrl);
      toast({ title: "Done!", description: "Photo uploaded" });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload error", description: error.message || "Failed to upload image", variant: "destructive" });
      setPreview(currentUrl || null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUpload("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />
      <div className="flex flex-col items-center gap-3">
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Preview" className="w-24 h-24 rounded-full object-cover border-2 border-primary/50" />
            <button
              onClick={handleRemove}
              className="absolute -top-1 -right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/80 transition-colors"
              disabled={uploading}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 rounded-full bg-muted/50 border-2 border-dashed border-muted-foreground/50 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            <Camera className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
        <FlameButton
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
              Загрузка...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              {preview ? "Изменить фото" : "Загрузить фото"}
            </>
          )}
        </FlameButton>
      </div>
    </div>
  );
}
