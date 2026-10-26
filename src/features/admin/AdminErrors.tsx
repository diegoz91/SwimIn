import React, { useMemo, useState } from 'react';
import type { ClientErrorRow } from '@/services/database';
import { ChoiceChips } from '@/components/form/Field';
import { formatRelativeTime } from '@/utils/format';

type Source = 'tutti' | 'client' | 'server';
interface Group { key: string; source: 'client' | 'server'; message: string; where: string; count: number; people: number; last: ClientErrorRow }

/** Errori uguali raggruppati per impronta: quante volte, quante persone, ultimo dettaglio. */
export function groupErrors(rows: ClientErrorRow[]): Group[] {
    const map = new Map<string, { rows: ClientErrorRow[] }>();
    for (const r of rows) {
        const key = r.fingerprint || `${r.source || 'client'}|${r.action || ''}|${r.message}`;
        const g = map.get(key) ?? { rows: [] };
        g.rows.push(r);
        map.set(key, g);
    }
    return [...map.entries()]
        .map(([key, g]) => {
            const last = g.rows.reduce((a, b) => (a.$createdAt > b.$createdAt ? a : b));
            const source = last.source === 'server' ? 'server' : 'client';
            return {
                key,
                source,
                message: last.message,
                where: source === 'server' ? last.action || 'Function' : last.url || '',
                count: g.rows.length,
                people: new Set(g.rows.map((r) => r.userId).filter((u) => u && u !== 'system')).size,
                last,
            } as Group;
        })
        .sort((a, b) => (a.last.$createdAt < b.last.$createdAt ? 1 : -1));
}

/** Registro errori del pannello admin (ultimi 100): app e server insieme, raggruppati. */
export const AdminErrors: React.FC<{ rows: ClientErrorRow[] }> = ({ rows }) => {
    const [source, setSource] = useState<Source>('tutti');
    const groups = useMemo(() => groupErrors(rows), [rows]);
    const shown = groups.filter((g) => source === 'tutti' || g.source === source);
    const count = (s: Source) => groups.filter((g) => s === 'tutti' || g.source === s).length;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <ChoiceChips<Source>
                    label="Origine degli errori"
                    options={[
                        { value: 'tutti', label: `Tutti (${count('tutti')})` },
                        { value: 'server', label: `Server (${count('server')})` },
                        { value: 'client', label: `App (${count('client')})` },
                    ]}
                    value={[source]}
                    onChange={(v) => setSource(v[0] || 'tutti')}
                />
                <p className="text-sm text-slate-600">Per ogni errore nuovo ricevi una notifica, al massimo una all’ora per lo stesso errore.</p>
            </div>
            {shown.length === 0 ? (
                <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Nessun errore registrato.</p>
            ) : (
                <ul className="space-y-2">
                    {shown.map((g) => (
                        <li key={g.key} className="bg-white rounded-xl border border-slate-200">
                            <details>
                                <summary className="cursor-pointer px-4 py-3 flex flex-wrap gap-x-3 gap-y-1 items-baseline">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${g.source === 'server' ? 'bg-abisso text-white' : 'bg-slate-100 text-slate-700'}`}>{g.source === 'server' ? 'Server' : 'App'}</span>
                                    <span className="font-mono text-sm text-galleggiante-700 break-all min-w-0 flex-1">{g.message}</span>
                                    <span className="text-xs text-slate-600 tabular-nums">
                                        {g.count === 1 ? '1 volta' : `${g.count} volte`}
                                        {g.people > 0 ? ` · ${g.people === 1 ? '1 persona' : `${g.people} persone`}` : ''}
                                        {` · ${formatRelativeTime(g.last.$createdAt)}`}
                                    </span>
                                </summary>
                                <div className="px-4 pb-4 space-y-2">
                                    {g.where && <p className="text-xs text-slate-600">{g.source === 'server' ? 'Azione' : 'Pagina'}: <span className="font-mono">{g.where}</span></p>}
                                    <pre className="text-xs text-slate-600 whitespace-pre-wrap break-all">{g.last.stack || 'Nessun dettaglio.'}{g.last.userAgent ? `\n\n${g.last.userAgent}` : ''}</pre>
                                </div>
                            </details>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
