import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

export interface EmailSignatureSocialLink {
    label: string;
    url: string;
}

export interface EmailSignatureFields {
    full_name: string;
    job_title: string;
    company_name: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    logo_data_url: string;
    social_links: EmailSignatureSocialLink[];
    disclaimer: string;
}

export interface EmailSignatureData {
    ok: boolean;
    signature: EmailSignatureFields;
    signature_html: string;
    signature_text: string;
}

export function useEmailSignature() {
    return useQuery<EmailSignatureData>({
        queryKey: ['email-signature'],
        queryFn: () => api.get('/api/email-signature'),
        staleTime: 60_000,
    });
}

