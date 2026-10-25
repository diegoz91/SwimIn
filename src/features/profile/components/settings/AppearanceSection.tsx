import React from 'react';
import { ThemeCards } from '@/components/common/ThemePicker';
import { Group, SectionHeader } from './ui';

export const AppearanceSection: React.FC = () => (
    <>
        <SectionHeader title="Aspetto" description="Scegli il tema chiaro o scuro. La scelta vale per questo dispositivo." />
        <div className="space-y-5">
            <Group title="Tema">
                <div className="px-5 sm:px-6 py-4">
                    <ThemeCards />
                </div>
            </Group>
        </div>
    </>
);
