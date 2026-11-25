import flameLogoAsset from "@/assets/flame-mark.png.asset.json";
const flameLogo = flameLogoAsset.url;
import { BadgeCheck } from "lucide-react";

interface Props {
  /** px size of the badge */
  size?: number;
  className?: string;
}

/**
 * Official Flame badge — the custom flame mark shown next to the verified
 * checkmark for official Flame system accounts (Telegram-style).
 */
export function FlameBadge({ size = 14, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-0.5 shrink-0 ${className}`} title="Official Flame account">
      <BadgeCheck style={{ width: size, height: size }} className="text-blue-400" />
      <img
        src={flameLogo}
        alt="Official Flame"
        width={size}
        height={size}
        loading="lazy"
        style={{ width: size, height: size }}
        className="rounded-[3px] drop-shadow-[0_0_6px_rgba(127,90,240,0.7)]"
      />
    </span>
  );
}
