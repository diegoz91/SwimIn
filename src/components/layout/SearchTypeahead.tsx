import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconType } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useBlocks } from '@/context/BlocksContext';
import { databaseService } from '@/services/database';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { initialsAvatar } from '@/utils/avatar';
import { jobDisplayTitle } from '@/utils/jobs';
import { readRecentSearches, saveRecentSearch } from '@/utils/recentSearches';

type Item = {
    id: string;
    group: 'Persone' | 'Strutture' | 'Offerte di lavoro' | 'Gruppi' | 'Hashtag' | 'Ricerche recenti';
    title: string;
    subtitle?: string;
    image?: string;
    icon?: IconType;
    square?: boolean;
    to: string;
    /** Testo da salvare tra le ricerche recenti. */
    recent?: string;
};

const readRecent = () => readRecentSearches().slice(0, 5);
const saveRecent = saveRecentSearch;

/** Il termine cercato in grassetto dentro il risultato, come su LinkedIn. */
const Highlight: React.FC<{ text: string; term: string }> = ({ text, term }) => {
    const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
    if (i < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, i)}
            <strong className="font-bold text-abisso">{text.slice(i, i + term.length)}</strong>
            {text.slice(i + term.length)}
        </>
    );
};

/**
 * Ricerca nell'intestazione: da 2 lettere mostra subito persone, strutture, offerte, gruppi e hashtag,
 * senza premere Invio. Frecce per muoversi, Invio per aprire, Esc per chiudere. Con il campo vuoto
 * propone le ricerche recenti (salvate solo in questo browser).
 */
export const SearchTypeahead: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const blocks = useBlocks();
    const listId = useId();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState(-1);
    const [recent, setRecent] = useState<string[]>([]);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const seq = useRef(0);
    const term = query.trim();

    // Ricerca automatica da 2 caratteri, con una breve attesa mentre si scrive.
    useEffect(() => {
        if (term.length < 2 || !user) {
            setItems([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const id = ++seq.current;
        const t = window.setTimeout(async () => {
            const [net, jobs, groups, tags] = await Promise.allSettled([
                databaseService.searchNetwork(term, user.$id),
                databaseService.searchJobs(term, 3),
                databaseService.searchGroups(term, 3),
                databaseService.searchHashtags(term),
            ]);
            if (id !== seq.current) return; // è arrivata una ricerca più recente
            const out: Item[] = [];
            if (net.status === 'fulfilled') {
                const visible = net.value.profiles.filter((p) => !blocks.isHidden(p.userId || p.$id));
                for (const p of visible.filter((x) => x.userType === 'professional').slice(0, 4)) {
                    out.push({ id: `p-${p.$id}`, group: 'Persone', title: displayNameOf(p), subtitle: headlineOf(p), image: avatarOf(p), to: `/profile/${p.userId || p.$id}`, recent: term });
                }
                const structures = [
                    ...visible.filter((x) => x.userType === 'structure').map((p) => ({ id: p.userId || p.$id, title: displayNameOf(p), subtitle: [headlineOf(p), p.city].filter(Boolean).join(' · '), image: avatarOf(p) })),
                    ...net.value.facilities.map((f) => ({ id: f.$id, title: f.name, subtitle: [f.type, f.city].filter(Boolean).join(' · '), image: f.logo || initialsAvatar(f.name) })),
                ];
                for (const s of structures.slice(0, 3)) out.push({ ...s, id: `s-${s.id}`, group: 'Strutture', square: true, to: `/profile/${s.id}`, recent: term });
            }
            if (jobs.status === 'fulfilled') {
                for (const j of jobs.value) out.push({ id: `j-${j.$id}`, group: 'Offerte di lavoro', title: jobDisplayTitle(j), subtitle: [j.structureName, j.city].filter(Boolean).join(' · '), icon: 'briefcase', to: `/jobs/${encodeURIComponent(j.$id)}`, recent: term });
            }
            if (groups.status === 'fulfilled') {
                for (const g of groups.value) out.push({ id: `g-${g.$id}`, group: 'Gruppi', title: g.name, subtitle: `${g.membersCount || 0} ${g.membersCount === 1 ? 'membro' : 'membri'}`, icon: 'users', to: `/gruppi/${g.$id}`, recent: term });
            }
            if (tags.status === 'fulfilled') {
                for (const h of tags.value.slice(0, 3)) out.push({ id: `h-${h.tag}`, group: 'Hashtag', title: `#${h.tag}`, subtitle: `${h.posts} post`, icon: 'hashtag', to: `/hashtag/${encodeURIComponent(h.tag)}`, recent: term });
            }
            setItems(out);
            setLoading(false);
            setActive(-1);
        }, 220);
        return () => window.clearTimeout(t);
    }, [term, user]); // eslint-disable-line react-hooks/exhaustive-deps

    // Chiude cliccando fuori.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const recentItems: Item[] = recent.map((r) => ({ id: `r-${r}`, group: 'Ricerche recenti', title: r, icon: 'clock', to: `/cerca?q=${encodeURIComponent(r)}`, recent: r }));
    const seeAll: Item | null = term.length >= 2 ? { id: 'all', group: 'Persone', title: `Vedi tutti i risultati per “${term}”`, icon: 'search', to: `/cerca?q=${encodeURIComponent(term)}`, recent: term } : null;
    const shown = useMemo(() => (term.length >= 2 ? items : recentItems), [term, items, recent]); // eslint-disable-line react-hooks/exhaustive-deps
    const flat = seeAll ? [...shown, seeAll] : shown;

    const go = (item: Item) => {
        if (item.recent) saveRecent(item.recent);
        setOpen(false);
        setQuery('');
        inputRef.current?.blur();
        navigate(item.to);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(flat.length - 1, a + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
        else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (active >= 0 && flat[active]) go(flat[active]);
            else if (term) go({ id: 'all', group: 'Persone', title: term, to: `/cerca?q=${encodeURIComponent(term)}`, recent: term });
        }
    };

    const groups = [...new Set(shown.map((i) => i.group))];
    const showPanel = open && (term.length >= 2 || recentItems.length > 0);
    const optionId = (i: number) => `${listId}-opt-${i}`;

    return (
        <div ref={wrapRef} className="relative" role="search">
            <label htmlFor="global-search" className="sr-only">Cerca su SwimIn</label>
            <Icon type="search" className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
                ref={inputRef}
                id="global-search"
                type="search"
                role="combobox"
                aria-expanded={showPanel}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                autoComplete="off"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => { setRecent(readRecent()); setOpen(true); }}
                onKeyDown={onKeyDown}
                placeholder="Persone, piscine, offerte…"
                className="w-full h-10 pl-10 pr-9 rounded-full bg-piastrella border border-transparent text-sm text-abisso placeholder-slate-400 focus:bg-white focus:border-corsia-300 focus:ring-2 focus:ring-corsia-100 outline-none transition"
            />
            {loading && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-corsia-200 border-t-corsia-600 rounded-full animate-spin" aria-hidden="true" />}

            {showPanel && (
                <div className="absolute left-0 top-full mt-2 w-[min(28rem,calc(100vw-2rem))] bg-white rounded-2xl border border-slate-200 shadow-lift overflow-hidden z-[60]">
                    <ul id={listId} role="listbox" aria-label="Suggerimenti di ricerca" className="max-h-[70vh] overflow-y-auto py-1">
                        {term.length >= 2 && !loading && items.length === 0 && (
                            <li className="px-4 py-6 text-center text-sm text-slate-500" role="presentation">Nessun risultato rapido per “{term}”. Premi Invio per cercare in tutti i contenuti.</li>
                        )}
                        {term.length >= 2 && loading && items.length === 0 && (
                            <li className="px-4 py-3 space-y-3" role="presentation" aria-hidden="true">
                                {[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-3"><span className="w-9 h-9 rounded-full bg-slate-100 animate-pulse" /><span className="h-3 w-40 bg-slate-100 rounded animate-pulse" /></span>)}
                            </li>
                        )}
                        {groups.map((g) => (
                            <li key={g} role="presentation">
                                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-500">{g}</p>
                                <ul role="presentation">
                                    {shown.filter((i) => i.group === g).map((item) => {
                                        const idx = flat.indexOf(item);
                                        return (
                                            <li
                                                key={item.id}
                                                id={optionId(idx)}
                                                role="option"
                                                aria-selected={idx === active}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => go(item)}
                                                onMouseEnter={() => setActive(idx)}
                                                className={`flex items-center gap-3 px-4 py-2 cursor-pointer ${idx === active ? 'bg-piastrella' : ''}`}
                                            >
                                                {item.image ? (
                                                    <img src={item.image} alt="" className={`w-9 h-9 object-cover bg-slate-100 flex-shrink-0 ${item.square ? 'rounded-lg' : 'rounded-full'}`} />
                                                ) : (
                                                    <span className="w-9 h-9 rounded-lg bg-piastrella text-slate-500 grid place-items-center flex-shrink-0" aria-hidden="true"><Icon type={item.icon || 'search'} className="w-4 h-4" /></span>
                                                )}
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm text-slate-700 truncate"><Highlight text={item.title} term={term} /></span>
                                                    {item.subtitle && <span className="block text-xs text-slate-500 truncate">{item.subtitle}</span>}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>
                        ))}
                        {seeAll && (
                            <li
                                id={optionId(flat.length - 1)}
                                role="option"
                                aria-selected={active === flat.length - 1}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => go(seeAll)}
                                onMouseEnter={() => setActive(flat.length - 1)}
                                className={`mt-1 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-corsia-700 cursor-pointer flex items-center gap-2 ${active === flat.length - 1 ? 'bg-piastrella' : ''}`}
                            >
                                <Icon type="search" className="w-4 h-4" /> <span className="truncate">{seeAll.title}</span>
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};
