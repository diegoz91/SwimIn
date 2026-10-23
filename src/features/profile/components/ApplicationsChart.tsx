import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/** Candidature per annuncio (caricato solo quando si apre la scheda Statistiche). */
const ApplicationsChart: React.FC<{ data: { name: string; candidature: number }[] }> = ({ data }) => (
    <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis type="category" dataKey="name" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#0A2738' }} />
            <Tooltip cursor={{ fill: '#F2F8FA' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
            <Bar dataKey="candidature" name="Candidature" fill="#0E6A97" radius={[0, 6, 6, 0]} barSize={18} />
        </BarChart>
    </ResponsiveContainer>
);

export default ApplicationsChart;
