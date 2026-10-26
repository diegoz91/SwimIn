import { useLayoutEffect, type RefObject } from 'react';

/** Primo antenato che taglia il contenuto (overflow non visibile), altrimenti la finestra. */
function clippingRect(el: HTMLElement): DOMRect {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(overflowX + overflowY)) return p.getBoundingClientRect();
    }
    return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

/**
 * Tiene un menu a comparsa dentro il riquadro che lo contiene (es. la chat in un widget stretto):
 * se esce a destra o a sinistra lo sposta, se esce in alto lo apre sotto il pulsante.
 */
export function useKeepInside(ref: RefObject<HTMLElement | null>, open: boolean, margin = 8) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!open || !el) return;
        el.style.transform = '';
        el.style.top = '';
        el.style.bottom = '';
        const box = clippingRect(el);
        let r = el.getBoundingClientRect();
        if (r.top < box.top + margin) {
            // Nessuno spazio sopra: sotto il pulsante.
            el.style.bottom = 'auto';
            el.style.top = '100%';
            r = el.getBoundingClientRect();
        }
        let dx = 0;
        if (r.right > box.right - margin) dx = box.right - margin - r.right;
        if (r.left + dx < box.left + margin) dx = box.left + margin - r.left;
        if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`;
    }, [ref, open, margin]);
}
