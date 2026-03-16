/**
 * Zod schemas for list create/edit forms.
 * Shared contract for client validation; can be mirrored on API if desired.
 */

import { z } from 'zod';

export const createListFormSchema = z.object({
    name: z.string().min(1, 'List name is required').trim(),
    description: z.string().optional().transform((v) => (v?.trim() || undefined)),
});

export type CreateListFormValues = z.infer<typeof createListFormSchema>;

export const editListFormSchema = z.object({
    name: z.string().min(1, 'List name is required').trim(),
    description: z.string().nullable().optional().transform((v) => (v?.trim() || null)),
});

export type EditListFormValues = z.infer<typeof editListFormSchema>;
