/** Zod mirrors of the inline schemas in contracts/openapi.yaml (the referenced *.schema.json mirrors live in @hesabu/analytics). */
import { z } from 'zod';

export const RegisterBodySchema = z.object({
  device_id: z.string().min(1).max(200),
  platform: z.string().min(1).max(40),
  app_version: z.string().min(1).max(40),
  display_name: z.string().max(80).nullable().optional(),
});

export const PreferencesSchema = z.object({
  email: z.email().nullable().optional(),
  whatsapp_e164: z.string().regex(/^\+[1-9]\d{6,14}$/).nullable().optional(),
  locale: z.enum(['en', 'sw']).optional(),
  week_start: z.enum(['monday', 'sunday']).optional(),
  weekly_at: z.string().regex(/^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01]\d|2[0-3]):[0-5]\d$/).optional(),
  monthly_at: z.string().regex(/^([1-9]|[12]\d) ([01]\d|2[0-3]):[0-5]\d$/).optional(),
  channels: z.array(z.enum(['email', 'whatsapp', 'share'])).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});
export type PreferencesBody = z.infer<typeof PreferencesSchema>;

export const GenerateBodySchema = z.object({
  kind: z.enum(['weekly', 'monthly']),
  period: z.string().min(1).max(40),
  deliver: z.boolean().default(false),
  force: z.boolean().default(false),
});

export const DeliverBodySchema = z.object({
  channels: z.array(z.enum(['email', 'whatsapp'])).min(1),
});

export const ExtractBodySchema = z.object({
  items: z
    .array(
      z.object({
        sender: z.string().max(40),
        body_redacted: z.string().max(1000),
        received_at: z.iso.datetime({ offset: true }),
      }),
    )
    .max(20),
});

export const ReportKindQuerySchema = z.enum(['weekly', 'monthly']).optional();

export const SendEmailLinkBodySchema = z.object({
  email: z.email().max(254).optional(),
});
