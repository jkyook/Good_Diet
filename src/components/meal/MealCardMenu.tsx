import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

interface MealCardMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

export default function MealCardMenu({ onEdit, onDelete }: MealCardMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="식사 옵션 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 active:text-slate-700"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-40 bg-white border border-slate-100 rounded-xl shadow-lg overflow-hidden min-w-[120px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onEdit(); }}
            className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 active:bg-orange-100 flex items-center gap-2"
          >
            <span aria-hidden="true">✏️</span> 편집
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onDelete(); }}
            className="w-full text-left px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-100 flex items-center gap-2 border-t border-slate-100"
          >
            <span aria-hidden="true">🗑️</span> 삭제
          </button>
        </div>
      )}
    </div>
  );
}
