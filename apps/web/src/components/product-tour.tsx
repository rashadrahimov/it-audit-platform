'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface TourStep {
  selector: string;
  title: string;
  text: string;
}
export interface TourLabels {
  offerTitle: string;
  offerText: string;
  start: string;
  later: string;
  next: string;
  back: string;
  skip: string;
  done: string;
  stepOf: string; // '{i} из {n}'
  openGuide: string;
  hideAsk: string; // «Показывать тур при следующем входе?»
  hideYes: string; // «Да, показывать»
  hideNo: string; // «Нет, скрыть»
}

// Постоянный отказ (только по явному выбору пользователя). Пока флага нет —
// предложение тура показывается при КАЖДОМ входе (на /account).
const HIDE_KEY = 'iap-tour-hide';
const PAD = 6;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Интерактивный тур по платформе (T-H34): spotlight-подсветка элементов + тултип с шагами.
 * Без внешних библиотек (on-prem). Запуск: кнопка «?» в топ-баре, /account?tour=1,
 * или автопредложение ПРИ КАЖДОМ входе (на /account), пока пользователь не выберет
 * «больше не показывать». При закрытии тура/предложения — спрашиваем, показывать ли впредь.
 * Только desktop (шаги — в сайдбаре).
 */
export function ProductTour({
  steps,
  labels,
  startSignal,
}: {
  steps: TourStep[];
  labels: TourLabels;
  startSignal: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [idx, setIdx] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>(steps);
  const [offer, setOffer] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);

  const closeAll = useCallback(() => {
    setIdx(null);
    setOffer(false);
    setConfirmHide(false);
  }, []);

  // Любое закрытие тура/предложения — сперва спрашиваем, показывать ли впредь.
  const askHide = useCallback(() => {
    setIdx(null);
    setOffer(false);
    setConfirmHide(true);
  }, []);

  // «Нет, скрыть» — запомнить отказ навсегда.
  const hideForever = useCallback(() => {
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* приватный режим */
    }
    closeAll();
  }, [closeAll]);

  const begin = useCallback(() => {
    // берём только реально видимые цели (mobile прячет сайдбар — там тур не идёт)
    const vis = steps.filter((s) => {
      const el = document.querySelector<HTMLElement>(s.selector);
      return el && el.offsetParent !== null;
    });
    if (vis.length === 0) return;
    setVisibleSteps(vis);
    setOffer(false);
    setConfirmHide(false);
    setIdx(0);
  }, [steps]);

  // внешний запуск (кнопка «?» в топ-баре)
  useEffect(() => {
    if (startSignal > 0) begin();
  }, [startSignal, begin]);

  // запуск по /account?tour=1 (кнопка на странице гайда)
  useEffect(() => {
    if (searchParams.get('tour') === '1') {
      begin();
      router.replace(pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // автопредложение при КАЖДОМ входе на /account (desktop), пока не скрыто навсегда
  useEffect(() => {
    try {
      if (pathname === '/account' && !localStorage.getItem(HIDE_KEY) && window.innerWidth >= 768) {
        setOffer(true);
      }
    } catch {
      /* localStorage недоступен */
    }
  }, [pathname]);

  // позиция подсветки текущего шага
  useEffect(() => {
    if (idx === null) return;
    const step = visibleSteps[idx];
    if (!step) return;
    const el = document.querySelector<HTMLElement>(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'nearest' });
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [idx, visibleSteps]);

  // Esc — выход (с вопросом «показывать ли впредь»)
  useEffect(() => {
    if (idx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') askHide();
      if (e.key === 'ArrowRight')
        setIdx((i) => (i !== null && i < visibleSteps.length - 1 ? i + 1 : i));
      if (e.key === 'ArrowLeft') setIdx((i) => (i !== null && i > 0 ? i - 1 : i));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, visibleSteps.length, askHide]);

  // --- подтверждение «показывать ли впредь» (при любом закрытии) ---
  if (confirmHide) {
    return (
      <div
        data-testid="tour-confirm-hide"
        className="fixed right-5 bottom-5 z-[70] flex w-80 flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-lg"
      >
        <p className="text-sm font-semibold text-foreground">{labels.hideAsk}</p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="tour-keep-showing"
            onClick={closeAll}
            className="cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {labels.hideYes}
          </button>
          <button
            type="button"
            data-testid="tour-hide-forever"
            onClick={hideForever}
            className="cursor-pointer rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {labels.hideNo}
          </button>
        </div>
      </div>
    );
  }

  // --- автопредложение ---
  if (idx === null) {
    if (!offer) return null;
    return (
      <div
        data-testid="tour-offer"
        className="fixed right-5 bottom-5 z-[70] flex w-80 flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-lg"
      >
        <p className="text-sm font-semibold text-foreground">{labels.offerTitle}</p>
        <p className="text-xs text-secondary">{labels.offerText}</p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="tour-offer-start"
            onClick={begin}
            className="cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {labels.start}
          </button>
          <button
            type="button"
            data-testid="tour-offer-later"
            onClick={askHide}
            className="cursor-pointer rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {labels.later}
          </button>
        </div>
      </div>
    );
  }

  // --- активный тур ---
  const step = visibleSteps[idx];
  if (!step || !rect) return null;
  const last = idx === visibleSteps.length - 1;
  // Тултип: под целью → над целью → (огромная цель, напр. сайдбар) по центру сбоку.
  // Всегда clamp в пределы вьюпорта, иначе кнопки некликабельны.
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const TIP_W = 320;
  const TIP_H = 230;
  let tipTop: number;
  let tipLeft: number;
  if (rect.height > vh * 0.6) {
    // цель почти во весь экран (сайдбар) — тултип по центру, справа от неё
    tipLeft = Math.min(rect.left + rect.width + 12, vw - TIP_W - 12);
    tipTop = vh / 2 - TIP_H / 2;
  } else {
    tipLeft = Math.min(Math.max(rect.left, 12), vw - TIP_W - 12);
    const below = rect.top + rect.height + 10;
    tipTop = below + TIP_H < vh ? below : Math.max(rect.top - TIP_H - 10, 12);
  }
  tipTop = Math.min(Math.max(tipTop, 12), vh - TIP_H - 12);

  return (
    <div data-testid="tour-overlay" className="fixed inset-0 z-[70]">
      {/* spotlight: вырез вокруг цели затемнением через box-shadow */}
      <div
        aria-hidden
        className="absolute rounded-xl transition-all duration-300"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow: '0 0 0 9999px rgb(2 6 23 / 0.55)',
        }}
      />
      {/* клик по затемнению — ничего (защита от промаха) */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* тултип */}
      <div
        data-testid="tour-tooltip"
        className="absolute flex w-80 flex-col gap-2.5 rounded-2xl border border-border bg-surface p-5 shadow-lg"
        style={{ top: tipTop, left: tipLeft, width: TIP_W }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-foreground">{step.title}</p>
          <span className="text-[11px] font-medium whitespace-nowrap text-secondary">
            {labels.stepOf
              .replace('{i}', String(idx + 1))
              .replace('{n}', String(visibleSteps.length))}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-secondary">{step.text}</p>
        <div className="mt-1 flex items-center gap-2">
          {idx > 0 && (
            <button
              type="button"
              onClick={() => setIdx(idx - 1)}
              className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {labels.back}
            </button>
          )}
          <button
            type="button"
            data-testid="tour-next"
            onClick={() => (last ? askHide() : setIdx(idx + 1))}
            className="cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {last ? labels.done : labels.next}
          </button>
          {!last && (
            <button
              type="button"
              onClick={askHide}
              className="ml-auto cursor-pointer px-2 py-1.5 text-xs font-medium text-secondary transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {labels.skip}
            </button>
          )}
        </div>
        {/* точки прогресса */}
        <div className="flex gap-1.5">
          {visibleSteps.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`h-1 flex-1 rounded-full transition-colors ${i <= idx ? 'bg-accent' : 'bg-muted'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
