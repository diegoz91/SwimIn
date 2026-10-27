import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { ChoiceChips, Field, fieldClass } from '@/components/form/Field';
import { ProvinceSelect, Select } from '@/components/form/Pickers';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { storageService } from '@/services/storage';
import { Icon } from '@/components/ui/Icon';
import { GROUP_CATEGORIES, GROUP_PRIVACY } from '@/data/groups';
import { check, maxLength, minLength, province, required } from '@/utils/validation';
import type { Group, GroupCategory, GroupPrivacy } from '@/types/types';

type Values = {
    name: string;
    description: string;
    rules: string;
    category: GroupCategory;
    privacy: GroupPrivacy;
    province: string;
    cover: string;
};

export const validateGroup = (v: Values): FormErrors<Values> => ({
    name: check(v.name, required('Dai un nome al gruppo.'), minLength(3), maxLength(80)),
    description: check(v.description, required('Spiega di cosa si parla nel gruppo.'), minLength(20, 'Scrivi almeno 20 caratteri: aiuta le persone a capire se fa per loro.'), maxLength(2000)),
    rules: check(v.rules, maxLength(2000)),
    province: check(v.province, province),
});

const fromGroup = (g?: Group | null): Values => ({
    name: g?.name || '',
    description: g?.description || '',
    rules: g?.rules || '',
    category: g?.category || 'master',
    privacy: g?.privacy || 'open',
    province: g?.province || '',
    cover: g?.cover || '',
});

/** Crea un gruppo o modifica quello esistente (solo amministratori). */
export const GroupFormModal: React.FC<{ open: boolean; group?: Group | null; onClose: () => void; onSaved: (g: Group) => void }> = ({ open, group, onClose, onSaved }) => {
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const form = useForm<Values>(fromGroup(group), useCallback(validateGroup, []));
    const { values, errors, bind, set } = form;

    useEffect(() => {
        if (open) form.reset(fromGroup(group));
    }, [open, group]); // eslint-disable-line react-hooks/exhaustive-deps

    const onCover = async (file?: File) => {
        if (!file) return;
        setUploading(true);
        try {
            set('cover', await storageService.uploadProfileImage(file, 'cover'));
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Caricamento non riuscito.', 'error');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const submit = form.handleSubmit(async (v) => {
        setSaving(true);
        const data = { ...v, name: v.name.trim(), description: v.description.trim(), rules: v.rules.trim() };
        try {
            const saved = group ? await databaseService.updateGroup(group.$id, data) : await databaseService.createGroup(data);
            showToast(group ? 'Gruppo aggiornato.' : 'Gruppo creato: invita i tuoi collegamenti a entrare.', 'success');
            onSaved(saved);
            onClose();
        } catch (err) {
            console.error('Gruppo:', err);
            showToast(err instanceof Error && err.message ? err.message : 'Salvataggio non riuscito.', 'error');
        } finally {
            setSaving(false);
        }
    });

    return (
        <FormModal
            open={open}
            title={group ? 'Modifica il gruppo' : 'Crea un gruppo'}
            description={group ? undefined : 'Uno spazio per chi condivide la stessa vasca, lo stesso brevetto o la stessa passione.'}
            icon="users"
            size="lg"
            dirty={form.isDirty}
            busy={saving || uploading}
            busyLabel={uploading ? 'Caricamento…' : 'Salvataggio…'}
            submitLabel={group ? 'Salva modifiche' : 'Crea gruppo'}
            onClose={onClose}
            onSubmit={submit}
            formRef={form.formRef}
        >
            <div>
                <p className="text-sm font-semibold text-abisso mb-1.5">Copertina <span className="ml-1 font-normal text-slate-400">facoltativa</span></p>
                <div className="relative h-28 rounded-xl overflow-hidden bg-linear-to-br from-corsia-700 to-cloro-500">
                    {values.cover && <img src={values.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                    <div className="absolute bottom-2 right-2 flex gap-2">
                        {values.cover && (
                            <button type="button" onClick={() => set('cover', '')} className="px-3 py-1.5 rounded-full bg-white/90 text-sm font-semibold text-slate-700 hover:bg-white">Rimuovi</button>
                        )}
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-1.5 rounded-full bg-white/90 text-sm font-semibold text-abisso hover:bg-white flex items-center gap-1.5">
                            <Icon type="camera" className="w-4 h-4" /> {values.cover ? 'Cambia' : 'Carica immagine'}
                        </button>
                    </div>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
                </div>
            </div>

            <Field id="group-name" label="Nome del gruppo" error={errors.name} count={{ value: values.name, max: 80 }}>
                <input {...bind('name')} maxLength={90} placeholder="Es. Master Lombardia" />
            </Field>

            <Field id="group-description" label="Di cosa si parla" error={errors.description} count={{ value: values.description, max: 2000 }}>
                <textarea {...bind('description')} rows={4} className={fieldClass(errors.description, 'resize-y')} placeholder="Allenamenti, gare, consigli: chi può entrare e cosa trova nel gruppo." />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="group-category" label="Categoria">
                    <Select label="Categoria" value={values.category} onChange={(c) => set('category', c as GroupCategory)} options={GROUP_CATEGORIES} />
                </Field>
                <Field id="group-province" label="Provincia" optional error={errors.province} hint="Per i gruppi legati a un territorio.">
                    <ProvinceSelect value={values.province} onChange={(c) => set('province', c)} onBlur={() => form.touch('province')} />
                </Field>
            </div>

            <div>
                <p className="text-sm font-semibold text-abisso mb-1.5">Chi può entrare</p>
                <ChoiceChips label="Chi può entrare" options={GROUP_PRIVACY} value={[values.privacy]} onChange={(v) => set('privacy', v[0])} />
                <p className="mt-1.5 text-xs text-slate-500">{GROUP_PRIVACY.find((p) => p.value === values.privacy)?.description} I post sono visibili a tutti gli iscritti a SwimIn.</p>
            </div>

            <Field id="group-rules" label="Regole del gruppo" optional error={errors.rules} count={{ value: values.rules, max: 2000 }}>
                <textarea {...bind('rules')} rows={3} className={fieldClass(errors.rules, 'resize-y')} placeholder="Es. Niente pubblicità, rispetto per tutti, annunci di lavoro solo con compenso indicato." />
            </Field>
        </FormModal>
    );
};
