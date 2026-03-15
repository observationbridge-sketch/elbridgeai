import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSounds } from "@/hooks/use-sounds";

interface BadgePopupProps {
  show: boolean;
  badgeIcon: string;
  badgeName: string;
  onClose: () => void;
}

export function BadgePopup({ show, badgeIcon, badgeName, onClose }: BadgePopupProps) {
  const [visible, setVisible] = useState(false);
  const sounds = useSounds();

  useEffect(() => {
    if (show) {
      setVisible(true);
      sounds.playBadge();
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl p-8 text-center max-w-sm w-full card-shadow animate-scale-in space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl">{badgeIcon}</div>
        <h2 className="text-xl font-bold text-foreground">You earned a new badge! 🎉</h2>
        <p className="text-lg font-bold text-primary">{badgeName}</p>
        <Button variant="hero" onClick={onClose} className="w-full">
          Awesome!
        </Button>
      </div>
    </div>
  );
}
