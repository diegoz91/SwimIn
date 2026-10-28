import { useEffect, useRef, useState } from 'react';

/** Distanza da trascinare (px) per aggiornare. */
export const PULL_THRESHOLD = 70;
/** Resistenza: il contenuto si sposta meno del dito, come nelle app native. */
export const pullDistance = (dy: number) => (dy <= 0 ? 0 : Math.min(110, dy * 0.5));

/**
 * Trascina verso il basso in cima all'area che scorre (#scroll-root) per aggiornare, come nelle app:
 * solo con il tocco, solo quando sei già in cima, mai da solo.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, enabled = true) {
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const start = useRef<number | null>(null);
    const refreshRef = useRef(onRefresh);
    refreshRef.current = onRefresh;
    const pullRef = useRef(0);

    useEffect(() => {
        const root = document.getElementById('scroll-root');
        if (!enabled || !root) return;
        const onStart = (e: TouchEvent) => {
            start.current = root.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
        };
        const onMove = (e: TouchEvent) => {
            if (start.current === null) return;
            const d = pullDistance(e.touches[0].clientY - start.current);
            if (root.scrollTop > 0) { start.current = null; pullRef.current = 0; setPull(0); return; }
            pullRef.current = d;
            setPull(d);
        };
        const onEnd = async () => {
            if (start.current === null) return;
            start.current = null;
            const reached = pullRef.current >= PULL_THRESHOLD;
            pullRef.current = 0;
            setPull(0);
            if (!reached) return;
            setRefreshing(true);
            try { await refreshRef.current(); } finally { setRefreshing(false); }
        };
        root.addEventListener('touchstart', onStart, { passive: true });
        root.addEventListener('touchmove', onMove, { passive: true });
        root.addEventListener('touchend', onEnd);
        root.addEventListener('touchcancel', onEnd);
        return () => {
            root.removeEventListener('touchstart', onStart);
            root.removeEventListener('touchmove', onMove);
            root.removeEventListener('touchend', onEnd);
            root.removeEventListener('touchcancel', onEnd);
        };
    }, [enabled]);

    return { pull, refreshing, ready: pull >= PULL_THRESHOLD };
}
