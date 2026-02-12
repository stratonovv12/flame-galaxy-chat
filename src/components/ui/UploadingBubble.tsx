import { X } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { PendingUpload } from "@/hooks/useMediaUpload";

interface UploadingBubbleProps {
  upload: PendingUpload;
  onCancel: (id: string) => void;
}

export function UploadingBubble({ upload, onCancel }: UploadingBubbleProps) {
  const isCircle = upload.type === "circle";

  return (
    <div className="flex justify-end">
      <div className="max-w-[80%]">
        <GlassCard className="p-3 bg-primary/20 border-primary/30 relative overflow-hidden">
          {isCircle ? (
            <div className="relative w-48 h-48 rounded-full overflow-hidden border-2 border-primary/50 mx-auto mb-2">
              <video
                src={upload.localUrl}
                muted
                playsInline
                autoPlay
                loop
                className="w-full h-full object-cover"
                style={{ aspectRatio: "1/1" }}
              />
              {/* Progress overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded-full">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3"
                    className="stroke-muted-foreground/20" />
                  <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3"
                    className="stroke-primary transition-all duration-300"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 20}
                    strokeDashoffset={2 * Math.PI * 20 - (2 * Math.PI * 20 * upload.progress) / 100} />
                </svg>
                <span className="absolute text-xs font-bold text-primary-foreground">
                  {upload.progress}%
                </span>
              </div>
            </div>
          ) : (
            <div className="relative mb-2">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">Отправка аудио...</p>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {upload.progress}%
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {upload.progress < 100 ? "Отправка..." : "Завершение..."}
            </p>
            <button
              onClick={() => onCancel(upload.id)}
              className="p-1 hover:bg-destructive/20 rounded-full transition-colors"
              title="Отменить отправку"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
