import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { Pencil, Save, Image as ImageIcon, Plus, Trash2, Globe, Phone, Mail, MapPin } from 'lucide-react';

import api from '../../api/client';
import { GlassCard, Button } from '../../components/ui';

const signatureFormSchema = z.object({
    full_name: z.string().trim().max(120).default(''),
    job_title: z.string().trim().max(120).default(''),
    company_name: z.string().trim().max(160).default(''),
    phone: z.string().trim().max(60).default(''),
    email: z
        .string()
        .trim()
        .max(200)
        .default('')
        .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'Invalid email address' }),
    website: z
        .string()
        .trim()
        .max(220)
        .default('')
        .refine((v) => {
            if (!v) return true;
            try {
                const raw = String(v).trim();
                const candidate = /^(https?:)?\/\//i.test(raw) ? raw : `https://${raw}`;
                const parsed = new URL(candidate);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch {
                return false;
            }
        }, { message: 'Website must be a valid domain or http(s) URL' }),
    address: z.string().trim().max(600).default(''),
    logo_data_url: z
        .string()
        .trim()
        .max(500_000)
        .default('')
        .refine((v) => {
            if (!v) return true;
            return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(v);
        }, { message: 'Logo must be a data:image/*;base64 URL' }),
    social_links: z.array(
        z.object({
            label: z.string().trim().max(32).default(''),
            url: z.string().trim().max(220).default(''),
        }).superRefine((val, ctx) => {
            const url = String(val.url ?? '').trim();
            if (!url) return;
            try {
                const candidate = /^(https?:)?\/\//i.test(url) ? url : `https://${url}`;
                const parsed = new URL(candidate);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Social URL must be http(s)' });
                }
            } catch {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid social URL' });
            }
        })
    ).max(10).default([]),
    disclaimer: z.string().trim().max(900).default(''),
});

type SignatureFormValues = z.infer<typeof signatureFormSchema>;

const INPUT_BASE =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/50 transition-colors';

const TEXTAREA_BASE =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/50 transition-colors resize-none';

function getInitialEmptyValues(): SignatureFormValues {
    return {
        full_name: '',
        job_title: '',
        company_name: '',
        phone: '',
        email: '',
        website: '',
        address: '',
        logo_data_url: '',
        social_links: [],
        disclaimer: '',
    };
}

export default function SignatureTab() {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['email-signature'],
        queryFn: async () => {
            const res = await api.get('/api/email-signature');
            return res as { ok: boolean; signature: SignatureFormValues };
        },
        staleTime: 60_000,
    });

    const signatureDefaults = useMemo(() => {
        if (!data?.signature) return getInitialEmptyValues();
        const s = data.signature as Partial<SignatureFormValues>;
        return {
            ...getInitialEmptyValues(),
            ...s,
            social_links: Array.isArray(s.social_links) ? s.social_links : [],
        };
    }, [data]);

    const form = useForm<SignatureFormValues>({
        resolver: zodResolver(signatureFormSchema),
        defaultValues: signatureDefaults,
        mode: 'onChange',
    });

    const { control, register, watch, handleSubmit, reset, setValue, formState } = form;
    const { fields: socialFields, append: appendSocial, remove: removeSocial } = useFieldArray({
        control,
        name: 'social_links',
    });

    const watched = watch();

    const [logoError, setLogoError] = useState<string | null>(null);
    const onLogoPick = useCallback((file: File | null) => {
        setLogoError(null);
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setLogoError('Please choose an image file.');
            return;
        }
        if (file.size > 500_000) {
            setLogoError('Logo image is too large (max 500KB).');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            setValue('logo_data_url', result, { shouldDirty: true, shouldTouch: true });
        };
        reader.onerror = () => {
            setLogoError('Failed to read the image file.');
        };
        reader.readAsDataURL(file);
    }, [setValue]);

    const signaturePreview = useMemo(() => {
        const fullName = watched.full_name.trim();
        const jobTitle = watched.job_title.trim();
        const companyName = watched.company_name.trim();
        const phone = watched.phone.trim();
        const email = watched.email.trim();
        const website = watched.website.trim();
        const address = watched.address.trim();
        const disclaimer = watched.disclaimer.trim();
        const logoDataUrl = watched.logo_data_url.trim();
        const socialLinks = (watched.social_links || []).filter((s) => s.url.trim());

        return { fullName, jobTitle, companyName, phone, email, website, address, disclaimer, logoDataUrl, socialLinks };
    }, [watched]);

    const saveMutation = useMutation({
        mutationFn: async (payload: SignatureFormValues) => api.post('/api/email-signature', payload),
    });

    const onSubmit = handleSubmit(async (values) => {
        setSaveStatus('saving');
        setSaveError(null);
        try {
            await saveMutation.mutateAsync(values);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2200);
        } catch (e: unknown) {
            setSaveStatus('error');
            setSaveError(e instanceof Error ? e.message : 'Save failed');
        }
    });

    // Populate form once we fetch saved signature.
    useEffect(() => {
        if (isLoading) return;
        reset(signatureDefaults);
    }, [isLoading, reset, signatureDefaults]);

    return (
        <GlassCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Pencil size={18} className="text-white/50" aria-hidden="true" />
                    Signature
                </h2>
                <div className="flex items-center gap-3">
                    {saveStatus === 'saved' && (
                        <span className="text-xs text-emerald-300 font-semibold">Saved</span>
                    )}
                    <Button
                        variant="primary"
                        onClick={() => void onSubmit()}
                        disabled={saveMutation.isPending || !formState.isValid}
                        aria-label="Save signature"
                    >
                        <Save size={14} className="mr-1" aria-hidden="true" />
                        {saveMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </div>

            {saveError && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-400/30 text-red-200 text-sm" role="alert">
                    {saveError}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <form
                    className="space-y-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void onSubmit();
                    }}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="sig-full-name" className="block text-sm font-medium text-white/80 mb-1">
                                Full name
                            </label>
                            <input id="sig-full-name" {...register('full_name')} placeholder="Alex from Foundly Start" className={INPUT_BASE} />
                        </div>
                        <div>
                            <label htmlFor="sig-job-title" className="block text-sm font-medium text-white/80 mb-1">
                                Job title
                            </label>
                            <input id="sig-job-title" {...register('job_title')} placeholder="Head of Partnerships" className={INPUT_BASE} />
                        </div>
                        <div className="sm:col-span-2">
                            <label htmlFor="sig-company-name" className="block text-sm font-medium text-white/80 mb-1">
                                Company name
                            </label>
                            <input id="sig-company-name" {...register('company_name')} placeholder="Foundly Start" className={INPUT_BASE} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="sig-phone" className="block text-sm font-medium text-white/80 mb-1">
                                Phone number
                            </label>
                            <input id="sig-phone" {...register('phone')} placeholder="+44 20 1234 5678" className={INPUT_BASE} />
                        </div>
                        <div>
                            <label htmlFor="sig-email" className="block text-sm font-medium text-white/80 mb-1">
                                Email
                            </label>
                            <input id="sig-email" {...register('email')} placeholder="alex@company.com" className={INPUT_BASE} />
                        </div>
                        <div className="sm:col-span-2">
                            <label htmlFor="sig-website" className="block text-sm font-medium text-white/80 mb-1">
                                Website
                            </label>
                            <input id="sig-website" {...register('website')} placeholder="https://company.com" className={INPUT_BASE} />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="sig-address" className="block text-sm font-medium text-white/80 mb-1">
                            Address
                        </label>
                        <textarea
                            id="sig-address"
                            {...register('address')}
                            placeholder="Street, City, Postcode&#10;United Kingdom"
                            className={TEXTAREA_BASE}
                            rows={3}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <label htmlFor="sig-logo" className="block text-sm font-medium text-white/80">
                                Profile image / logo
                            </label>
                            {watched.logo_data_url ? (
                                <button
                                    type="button"
                                    onClick={() => setValue('logo_data_url', '', { shouldDirty: true })}
                                    className="text-xs text-violet-300 hover:text-violet-200 underline"
                                    aria-label="Remove logo"
                                >
                                    Remove
                                </button>
                            ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <label
                                htmlFor="sig-logo"
                                className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white/80 hover:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
                            >
                                <ImageIcon size={14} aria-hidden="true" />
                                Upload
                            </label>
                            <input
                                id="sig-logo"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => onLogoPick(e.target.files?.[0] ?? null)}
                                aria-label="Upload logo image"
                            />
                            {watched.logo_data_url ? (
                                <span className="text-xs text-white/60">Ready</span>
                            ) : (
                                <span className="text-xs text-white/50">Optional</span>
                            )}
                        </div>
                        {logoError && (
                            <p className="text-xs text-red-300" role="alert">
                                {logoError}
                            </p>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <label className="text-sm font-medium text-white/80">Social links</label>
                            <button
                                type="button"
                                onClick={() => appendSocial({ label: '', url: '' })}
                                className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200 underline"
                                aria-label="Add social link"
                            >
                                <Plus size={12} aria-hidden="true" />
                                Add
                            </button>
                        </div>

                        {socialFields.length === 0 ? (
                            <p className="text-xs text-white/50">Add LinkedIn, X, or any link you want to show.</p>
                        ) : (
                            <div className="space-y-3">
                                {socialFields.map((f, idx) => (
                                    <div key={f.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <input
                                                {...register(`social_links.${idx}.label` as const)}
                                                placeholder="Label (e.g. LinkedIn)"
                                                className={INPUT_BASE}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                {...register(`social_links.${idx}.url` as const)}
                                                placeholder="https://..."
                                                className={INPUT_BASE}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeSocial(idx)}
                                                className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
                                                aria-label="Remove social link"
                                            >
                                                <Trash2 size={14} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label htmlFor="sig-disclaimer" className="block text-sm font-medium text-white/80 mb-1">
                            Disclaimer / footer text
                        </label>
                        <textarea
                            id="sig-disclaimer"
                            {...register('disclaimer')}
                            placeholder="Optional legal or compliance disclaimer..."
                            className={TEXTAREA_BASE}
                            rows={3}
                        />
                    </div>
                </form>

                <div className="space-y-3">
                    <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                        <div className="flex items-start gap-4">
                            {signaturePreview.logoDataUrl ? (
                                <img
                                    src={signaturePreview.logoDataUrl}
                                    alt="Logo"
                                    className="w-14 h-14 rounded-2xl object-cover"
                                />
                            ) : null}
                            <div className="min-w-0">
                                {signaturePreview.fullName ? (
                                    <div className="text-base font-semibold text-white/95 leading-snug">
                                        {signaturePreview.fullName}
                                    </div>
                                ) : (
                                    <div className="text-base font-semibold text-white/40 leading-snug">Your name</div>
                                )}
                                {signaturePreview.jobTitle ? (
                                    <div className="text-sm font-semibold text-violet-200/90 mt-1">{signaturePreview.jobTitle}</div>
                                ) : null}
                                {signaturePreview.companyName ? (
                                    <div className="text-sm text-white/70 mt-1">{signaturePreview.companyName}</div>
                                ) : null}
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            {signaturePreview.phone ? (
                                <div className="flex items-center gap-2 text-sm text-white/80">
                                    <Phone size={14} className="text-white/40" aria-hidden="true" />
                                    <span>{signaturePreview.phone}</span>
                                </div>
                            ) : null}
                            {signaturePreview.email ? (
                                <div className="flex items-center gap-2 text-sm text-white/80">
                                    <Mail size={14} className="text-white/40" aria-hidden="true" />
                                    <span>{signaturePreview.email}</span>
                                </div>
                            ) : null}
                            {signaturePreview.website ? (
                                <div className="flex items-center gap-2 text-sm text-white/80">
                                    <Globe size={14} className="text-white/40" aria-hidden="true" />
                                    <span className="truncate">{signaturePreview.website}</span>
                                </div>
                            ) : null}
                            {signaturePreview.address ? (
                                <div className="flex items-start gap-2 text-sm text-white/80">
                                    <MapPin size={14} className="text-white/40 mt-0.5" aria-hidden="true" />
                                    <span className="whitespace-pre-wrap">{signaturePreview.address}</span>
                                </div>
                            ) : null}

                            {signaturePreview.socialLinks.length > 0 ? (
                                <div className="pt-2">
                                    <div className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">Social</div>
                                    <div className="flex flex-wrap gap-2">
                                        {signaturePreview.socialLinks.map((s, idx) => (
                                            <span
                                                key={`${s.url}-${idx}`}
                                                className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-white/10 border border-white/10 text-white/80"
                                            >
                                                {s.label || 'Link'}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {signaturePreview.disclaimer ? (
                            <div className="mt-4 pt-3 border-t border-white/10 text-xs text-white/55 leading-relaxed whitespace-pre-wrap">
                                {signaturePreview.disclaimer}
                            </div>
                        ) : (
                            <div className="mt-4 pt-3 border-t border-white/10 text-xs text-white/40">
                                Optional footer text will appear here.
                            </div>
                        )}
                    </div>

                    <div className="text-xs text-white/50">
                        Tip: this signature can be inserted into conversations using the “Insert signature” button.
                    </div>
                </div>
            </div>
        </GlassCard>
    );
}

