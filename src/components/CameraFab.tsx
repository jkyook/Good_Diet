import React from 'react';
import { Camera } from 'lucide-react';

interface CameraFabProps {
  onCapture: () => void;
  hide?: boolean;
}

export default function CameraFab({ onCapture, hide = false }: CameraFabProps) {
  if (hide) return null;
  return (
    <button
      type="button"
      onClick={onCapture}
      aria-label="카메라로 식단 추가"
      className="fixed bottom-[84px] right-4 z-40 w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-[0_6px_14px_rgba(249,115,22,0.35)] active:scale-95 transition-transform"
      style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
    >
      <Camera className="w-6 h-6" aria-hidden="true" />
    </button>
  );
}
