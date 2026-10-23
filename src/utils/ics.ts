/**
 * File di calendario (.ics) per i turni: si aprono in Google Calendar, Apple
 * Calendario e Outlook. Orari in ora italiana (Europe/Rome).
 */
export interface IcsEvent {
    uid: string;
    title: string;
    /** YYYY-MM-DD */
    date: string;
    /** HH:MM */
    start: string;
    /** HH:MM */
    end: string;
    location?: string;
    description?: string;
}

const VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Rome',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
];

/** Testo con i caratteri speciali di iCalendar protetti. */
export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Le righe oltre 75 byte vanno spezzate (RFC 5545 §3.1). */
const fold = (line: string) => {
    const out: string[] = [];
    let rest = line;
    while (new TextEncoder().encode(rest).length > 75) {
        let cut = 74;
        while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
        out.push(rest.slice(0, cut));
        rest = ` ${rest.slice(cut)}`;
    }
    out.push(rest);
    return out.join('\r\n');
};

const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;

export function buildIcs(events: IcsEvent[], now: Date = new Date()): string {
    const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SwimIn//Turni//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...VTIMEZONE];
    for (const e of events) {
        lines.push(
            'BEGIN:VEVENT',
            `UID:${e.uid}@swimin`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART;TZID=Europe/Rome:${stamp(e.date, e.start)}`,
            `DTEND;TZID=Europe/Rome:${stamp(e.date, e.end)}`,
            `SUMMARY:${icsEscape(e.title)}`,
            ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
            ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
            'END:VEVENT'
        );
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
}

/** Scarica il file nel browser. */
export function downloadIcs(filename: string, events: IcsEvent[]) {
    const blob = new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
