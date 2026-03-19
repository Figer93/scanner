import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Mail, Send, ShieldCheck } from 'lucide-react';

import api from '../../api/client';
import { GlassCard, Button, Input } from '../../components/ui';

const TEXTAREA_BASE =
  'w-full rounded-inner bg-white/5 border border-white/10 text-white/90 text-sm px-3 py-2 placeholder-white/30 focus:outline-none focus:border-[var(--color-border-active)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y';

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.'),
  email: z.string().trim().email('Please enter a valid email address.'),
  company: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const s = (v ?? '').trim();
      return s ? s : undefined;
    }),
  website: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const s = (v ?? '').trim();
      return s ? s : undefined;
    }),
  message: z.string().trim().min(10, 'Message must be at least 10 characters.'),
  consent: z.boolean().refine((v) => v === true, { message: 'Consent is required to contact you.' }),
});

type ContactValues = z.infer<typeof contactSchema>;

function normaliseWebsite(raw: string | undefined) {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export default function ContactForm() {
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultValues = useMemo<ContactValues>(
    () => ({
      name: '',
      email: '',
      company: undefined,
      website: undefined,
      message: '',
      consent: false,
    }),
    []
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues,
    mode: 'onChange',
  });

  const onSubmit = useCallback(
    async (values: ContactValues) => {
      setSubmitState('submitting');
      setSubmitError(null);
      try {
        const payload = {
          ...values,
          website: normaliseWebsite(values.website),
        };

        await api.post('/api/welcome/contact', payload);
        setSubmitState('success');
        reset(defaultValues);
        // Let the success message stay visible briefly.
        setTimeout(() => setSubmitState('idle'), 3500);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to send message.';
        setSubmitState('error');
        setSubmitError(msg);
      }
    },
    [defaultValues]
  );

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-[220px]">
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <Building2 size={18} className="text-white/50" aria-hidden="true" />
            Contact &amp; setup support
          </h2>
          <p className="text-xs text-white/60">
            Tell us what you want to achieve. We’ll reply with setup guidance for your outreach workflow.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/50">
          <ShieldCheck size={14} aria-hidden="true" />
          No spam. Just a response.
        </div>
      </div>

      {submitState === 'success' ? (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 text-sm" role="status" aria-live="polite">
          Message sent. We’ll get back to you soon.
        </div>
      ) : null}

      {submitState === 'error' && submitError ? (
        <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-400/20 text-red-200 text-sm" role="alert">
          {submitError}
        </div>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(onSubmit)();
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="welcome-name" className="block text-sm font-medium text-white/80 mb-1">
              Your name
            </label>
            <Input
              id="welcome-name"
              placeholder="Alex"
              {...register('name')}
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-label="Your name"
            />
            {errors.name ? <p className="text-xs text-red-300 mt-1">{errors.name.message}</p> : null}
          </div>

          <div>
            <label htmlFor="welcome-email" className="block text-sm font-medium text-white/80 mb-1 flex items-center gap-2">
              <Mail size={14} className="text-white/40" aria-hidden="true" />
              Work email
            </label>
            <Input
              id="welcome-email"
              type="email"
              placeholder="alex@company.com"
              {...register('email')}
              aria-invalid={errors.email ? 'true' : 'false'}
              aria-label="Work email"
            />
            {errors.email ? <p className="text-xs text-red-300 mt-1">{errors.email.message}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="welcome-company" className="block text-sm font-medium text-white/80 mb-1">
              Company (optional)
            </label>
            <Input
              id="welcome-company"
              placeholder="Your company"
              {...register('company')}
              aria-label="Company name"
            />
          </div>

          <div>
            <label htmlFor="welcome-website" className="block text-sm font-medium text-white/80 mb-1">
              Website (optional)
            </label>
            <Input
              id="welcome-website"
              placeholder="https://example.com"
              {...register('website')}
              aria-label="Website"
            />
          </div>
        </div>

        <div>
          <label htmlFor="welcome-message" className="block text-sm font-medium text-white/80 mb-1">
            What do you need help with?
          </label>
          <textarea
            id="welcome-message"
            {...register('message')}
            placeholder="We’re looking to automate lead enrichment + outreach for new UK businesses…"
            className={TEXTAREA_BASE}
            rows={5}
            aria-invalid={errors.message ? 'true' : 'false'}
            aria-label="Message"
          />
          {errors.message ? <p className="text-xs text-red-300 mt-1">{errors.message.message}</p> : null}
        </div>

        <label className="flex items-start gap-3 text-xs text-white/60 select-none">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border border-white/20 bg-white/5 accent-[var(--color-accent-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
            {...register('consent')}
            aria-label="Consent checkbox"
          />
          <span>
            I agree to be contacted about my enquiry. (Your details are only used to respond.)
          </span>
        </label>
        {errors.consent ? <p className="text-xs text-red-300">{errors.consent.message}</p> : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="primary"
            type="submit"
            disabled={!isValid || submitState === 'submitting'}
            aria-label="Send contact message"
          >
            <Send size={16} className="mr-1" aria-hidden="true" />
            {submitState === 'submitting' ? 'Sending…' : 'Send message'}
          </Button>
          <span className="text-xs text-white/40">
            Typically replies within 1 business day.
          </span>
        </div>
      </form>
    </GlassCard>
  );
}

