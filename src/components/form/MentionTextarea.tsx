import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import type { StructureProfile, UserProfile } from '@/types/types';

export type MentionMap = Record<string, string>;

/** Dal testo salvato (@[Nome](id)) a quello modificabile (@Nome), con la mappa nome → id. */
export function toEditable(text: string): { text: string; map: MentionMap } {
    const map: MentionMap = {};
    const out = text.replace(/@\[([^\]\n]{1,80})\]\(([A-Za-z0-9_.-]{1,36})\)/g, (_, name: string, id: string) => {
        map[name] = id;
        return `@${name}`;
    });
    return { text: out, map };
}

/** Dal testo modificabile a quello da salvare: ogni @Nome scelto dall'elenco torna @[Nome](id). */
export function fromEditable(text: string, map: MentionMap): string {
    const names = Object.keys(map).sort((a, b) => b.length - a.length);
    if (!names.length) return text;
    const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return text.replace(new RegExp(`@(${esc})(?![\\p{L}\\p{N}_])`, 'gu'), (_, name: string) => `@[${name}](${map[name]})`);
}

/**
 * Area di testo con @menzioni: scrivendo "@" e qualche lettera compare l'elenco di
 * persone e strutture (prima i collegamenti); scegliendo, il nome entra nel testo.
 */
export const MentionTextarea: React.FC<
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
        value: string;
        onChange: (value: string) => void;
        mentions: MentionMap;
        onMentionsChange: (map: MentionMap) => void;
        textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
    }
> = ({ value, onChange, mentions, onMentionsChange, textareaRef, onKeyDown, ...rest }) => {
    const { user } = useAuth();
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const ref = textareaRef || innerRef;
    const [query, setQuery] = useState<{ term: string; start: number } | null>(null);
    const [results, setResults] = useState<(UserProfile | StructureProfile)[]>([]);
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (!query) { setResults([]); return; }
        let alive = true;
        const t = window.setTimeout(() => {
            databaseService
                .searchMentionCandidates(query.term, user?.connections || [])
                .then((r) => { if (alive) { setResults(r.filter((p) => p.$id !== user?.$id)); setActive(0); } })
                .catch((err) => console.warn('Menzioni:', err));
        }, 150);
        return () => { alive = false; window.clearTimeout(t); };
    }, [query, user?.$id, user?.connections]);

    const detect = (text: string, caret: number) => {
        const before = text.slice(0, caret);
        const m = before.match(/(^|\s)@([\p{L}\p{N}' ]{0,30})$/u);
        if (m && !m[2].includes('  ')) setQuery({ term: m[2], start: caret - m[2].length - 1 });
        else setQuery(null);
    };

    const pick = (p: UserProfile | StructureProfile) => {
        if (!query) return;
        const name = displayNameOf(p);
        const el = ref.current;
        const caret = el?.selectionStart ?? value.length;
        const next = `${value.slice(0, query.start)}@${name} ${value.slice(caret)}`;
        onChange(next);
        onMentionsChange({ ...mentions, [name]: p.$id });
        setQuery(null);
        window.setTimeout(() => {
            const pos = query.start + name.length + 2;
            el?.focus();
            el?.setSelectionRange(pos, pos);
        }, 0);
    };

    return (
        <div className="relative">
            <textarea
                {...rest}
                ref={ref}
                value={value}
                onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
                onClick={(e) => detect(value, (e.target as HTMLTextAreaElement).selectionStart)}
                onBlur={() => window.setTimeout(() => setQuery(null), 150)}
                onKeyDown={(e) => {
                    if (query && results.length) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); return; }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); return; }
                        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(results[active]); return; }
                        if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return; }
                    }
                    onKeyDown?.(e);
                }}
                aria-autocomplete="list"
            />
            {query && results.length > 0 && (
                <ul role="listbox" aria-label="Persone da menzionare" className="absolute left-0 right-0 top-full mt-1 z-40 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lift py-1">
                    {results.map((p, i) => (
                        <li key={p.$id} role="option" aria-selected={i === active}>
                            <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                                onMouseEnter={() => setActive(i)}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-left ${i === active ? 'bg-piastrella' : ''}`}
                            >
                                <img src={avatarOf(p)} alt="" className="w-8 h-8 rounded-full object-cover" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-abisso truncate">{displayNameOf(p)}</span>
                                    <span className="block text-xs text-slate-500 truncate">{headlineOf(p)}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
