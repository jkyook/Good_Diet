import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

interface MealCardMenuProps {
  onEdit: () => void;
  onDelete: () => void;
  onMemo?: () => void;
}

const POPOVER_W = 132;   // min-w-[132px] 기준
const POPOVER_H = 132;   // 3개 메뉴 항목 + padding 추정

export default function MealCardMenu({ onEdit, onDelete, onMemo }: MealCardMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 트리거 위치 기반 popover 좌표 계산 (viewport 안에 들어가도록 분기)
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 기본: 트리거 바로 아래 + 우측 정렬
    let top = rect.bottom + 4;
    let left = rect.right - POPOVER_W;
    // 하단 잘리면 트리거 위로
    if (top + POPOVER_H > vh - 8) top = rect.top - POPOVER_H - 4;
    // 좌측 음수면 viewport 안으로
    if (left < 8) left = 8;
    // 우측 넘치면 (희박) viewport 안으로
    if (left + POPOVER_W > vw - 8) left = vw - POPOVER_W - 8;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // 스크롤/리사이즈 시 popover 닫기 (위치 계산 동적 갱신 회피)
    const close = () => setOpen(false);
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const popover = open && pos ? createPortal(
    <div
      ref={popoverRef}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: POPOVER_W, zIndex: 200 }}
      className="bg-white border border-slate-100 rounded-xl shadow-lg overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 active:bg-orange-100 flex items-center gap-2"
      >
        <span aria-hidden="true">✏️</span> 편집
      </button>
      {onMemo && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => { e.stopPropagation(); setOpen(false); onMemo(); }}
          className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 active:bg-orange-100 flex items-center gap-2 border-t border-slate-100"
        >
          <span aria-hidden="true">📝</span> 메모
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
        className="w-full text-left px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-100 flex items-center gap-2 border-t border-slate-100"
      >
        <span aria-hidden="true">🗑️</span> 삭제
      </button>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="식사 옵션 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 active:text-slate-700"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {popover}
    </>
  );
}
