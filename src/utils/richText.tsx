import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Testo di post e commenti con #hashtag, @menzioni e link cliccabili.
 * Le menzioni sono salvate come @[Nome](idProfilo) e mostrate come "Nome".
 */
const TOKEN = /(@\[([^\]\n]{1,80})\]\(([A-Za-z0-9_.-]{1,36})\))|(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]{2,40})|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/gu;

export function RichText({ text, className }: { text: string; className?: string }) {
    const parts: React.ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of text.matchAll(TOKEN)) {
        const start = m.index ?? 0;
        if (start > last) parts.push(text.slice(last, start));
        if (m[1]) {
            parts.push(
                <Link key={i++} to={`/profile/${m[3]}`} className="font-semibold text-corsia-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {m[2]}
                </Link>
            );
        } else if (m[5]) {
            const tag = m[5];
            if (m[4]) parts.push(m[4]);
            parts.push(
                <Link key={i++} to={`/hashtag/${encodeURIComponent(tag.toLocaleLowerCase('it-IT'))}`} className="font-semibold text-corsia-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                    #{tag}
                </Link>
            );
        } else if (m[6]) {
            parts.push(
                <a key={i++} href={m[6]} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-corsia-700 underline break-all" onClick={(e) => e.stopPropagation()}>
                    {m[6].replace(/^https?:\/\/(www\.)?/, '')}
                </a>
            );
        }
        last = start + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return <span className={className}>{parts}</span>;
}

/** Testo semplice (es. anteprime, notifiche): le menzioni diventano solo il nome. */
export const plainText = (text: string) => text.replace(/@\[([^\]\n]{1,80})\]\([A-Za-z0-9_.-]{1,36}\)/g, '$1');

/** Taglia il testo senza spezzare una menzione @[Nome](id). */
export function cutText(text: string, max: number): string {
    if (text.length <= max) return text;
    let cut = max;
    const open = text.lastIndexOf('@[', cut);
    if (open !== -1) {
        const close = text.indexOf(')', open);
        if (close >= cut) cut = open;
    }
    return `${text.slice(0, cut).trimEnd()}…`;
}
