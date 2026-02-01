import { useState, useRef } from "react";
import { FlameButton } from "@/components/ui/FlameButton";
import { Camera, Upload, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CloudinaryUploadProps {
  onUpload: (url: string) => void;
  currentUrl?: string;
  className?: string;
}

// Cloudinary unsigned upload preset (public)
const CLOUDINARY_CLOUD_NAME = "demo"; // Users should replace with their cloud name
const CLOUDINARY_UPLOAD_PRESET = "docs_upload_example_us_preset"; // Unsigned preset

export function CloudinaryUpload({ onUpload, currentUrl, className }: CloudinaryUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, выберите изображение",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 5MB",
        variant: "destructive",
      });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to Cloudinary
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      onUpload(data.secure_url);
      toast({
        title: "Готово!",
        description: "Фото успешно загружено",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить изображение. Попробуйте ещё раз.",
        variant: "destructive",
      });
      setPreview(currentUrl || null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUpload("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
            <img
              src={preview}
              alt="Preview"
              className="w-24 h-24 rounded-full object-cover border-2 border-primary/50"
            />
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
