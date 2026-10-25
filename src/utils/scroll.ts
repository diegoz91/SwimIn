/** Scorre l'area della pagina (tra intestazione e menu, #scroll-root) o, senza guscio, la finestra. */
export function scrollPageTo(top: number, smooth = false) {
    const root = document.getElementById('scroll-root');
    const opts: ScrollToOptions = { top, behavior: smooth ? 'smooth' : 'auto' };
    if (root) root.scrollTo(opts);
    else window.scrollTo(opts);
}
