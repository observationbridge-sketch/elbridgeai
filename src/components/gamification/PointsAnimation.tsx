import { useState, useEffect } from "react";

interface PointsAnimationProps {
  points: number;
  show: boolean;
  onDone?: () => void;
}

export function PointsAnimation({ points, show, onDone }: PointsAnimationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show && points > 0) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [show, points, onDone]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center">
      <div className="animate-bounce text-center">
        <div className="bg-warning text-warning-foreground rounded-full px-6 py-3 shadow-lg text-xl font-bold">
          +{points} points! ⭐
        </div>
      </div>
    </div>
  );
}
