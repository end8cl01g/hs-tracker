import React, { useEffect } from 'react';
import { Sparkles, Trophy } from 'lucide-react';

interface SkyrimNotificationProps {
  title: string;
  subtitle: string;
  onClose: () => void;
}

export const SkyrimNotification: React.FC<SkyrimNotificationProps> = ({
  title,
  subtitle,
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-12 inset-x-0 z-50 flex items-center justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-[#080b12]/95 border-y-2 border-[#d4af37] px-6 py-3 rounded shadow-[0_0_25px_rgba(212,175,55,0.4)] backdrop-blur-md max-w-md w-full text-center relative overflow-hidden pointer-events-auto">
        {/* Diamond Header Accents */}
        <div className="flex items-center justify-center gap-2 text-[#d4af37] text-xs mb-1">
          <span>❖ ───</span>
          <Sparkles className="w-3.5 h-3.5 text-[#f59e0b] animate-spin" />
          <span>─── ❖</span>
        </div>

        {/* Title */}
        <h2 className="text-lg sm:text-xl font-extrabold tracking-[0.2em] text-[#fef08a] uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {title}
        </h2>

        {/* Subtitle */}
        <p className="text-xs text-[#e2e8f0] tracking-wide mt-0.5 leading-relaxed">
          {subtitle}
        </p>

        {/* Subtle bottom flare line */}
        <div className="w-1/2 h-0.5 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent mx-auto mt-2"></div>
      </div>
    </div>
  );
};
