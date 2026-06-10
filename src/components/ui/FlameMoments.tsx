import { useEffect, useState, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { X, Plus } from "lucide-react";

// Mock stories. In production these would come from a `flame_moments` table.
const MOCK_STORIES = [
  { id: "1", name: "Nova",   avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=900", seen: false },
  { id: "2", name: "Kai",    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200", image: "https://images.unsplash.com/photo-1502630859934-b3b41d484bfe?w=900", seen: false },
  { id: "3", name: "Luna",   avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200", image: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?w=900", seen: false },
  { id: "4", name: "Atlas",  avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200", image: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900", seen: true  },
  { id: "5", name: "Echo",   avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200", image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900", seen: true  },
  { id: "6", name: "Vega",   avatar: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200", image: "https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=900", seen: false },
];

export function FlameMoments() {
  const { t } = useLanguage();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (activeIdx === null) return;
    setProgress(0);
    const start = Date.now();
    const interval = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / 5000) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setActiveIdx(null);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [activeIdx]);

  const active = activeIdx !== null ? MOCK_STORIES[activeIdx] : null;

  return (
    <>
      <div className="px-1">
        <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar -mx-1 px-1">
          {/* Add own */}
          <button className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-16 h-16 rounded-full bg-muted/40 border-2 border-dashed border-primary/40 flex items-center justify-center">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground max-w-[64px] truncate">{t("yourMoment")}</span>
          </button>

          {MOCK_STORIES.map((s, i) => (
            <button key={s.id} onClick={() => setActiveIdx(i)} className="flex flex-col items-center gap-1 shrink-0 group">
              <div className={`p-[2px] rounded-full transition-all ${s.seen
                ? "bg-muted/40"
                : "bg-gradient-to-br from-[#a87cff] via-[#7f5af0] to-[#5b3fe0] shadow-[0_0_14px_rgba(127,90,240,0.55)]"
              }`}>
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-background">
                  <img src={s.avatar} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
              </div>
              <span className="text-[10px] max-w-[64px] truncate">{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-fade-in" onClick={() => setActiveIdx(null)}>
          {/* Progress bar */}
          <div className="absolute top-3 left-3 right-3 h-[3px] bg-white/15 rounded-full overflow-hidden z-10">
            <div className="h-full bg-white transition-[width] duration-75 ease-linear" style={{ width: `${progress}%` }} />
          </div>
          {/* Header */}
          <div className="absolute top-7 left-3 right-3 flex items-center gap-2 z-10">
            <img src={active.avatar} className="w-9 h-9 rounded-full object-cover border border-white/30" alt={active.name} />
            <span className="text-white text-sm font-medium drop-shadow">{active.name}</span>
            <button onClick={(e) => { e.stopPropagation(); setActiveIdx(null); }} className="ml-auto text-white/90 hover:text-white p-1">
              <X className="w-6 h-6" />
            </button>
          </div>
          <img src={active.image} alt="" className="max-h-full max-w-full object-contain animate-scale-in" />
        </div>
      )}
    </>
  );
}
