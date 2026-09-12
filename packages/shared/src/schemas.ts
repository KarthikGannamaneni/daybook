import { z } from 'zod';
import { ROLES } from './constants.ts';

/**
 * One definition of every input shape, imported by the client, the route handlers
 * and the edge functions. Anything that crosses a trust boundary is parsed here first.
 */

export const uuidSchema = z.string().uuid();

/** Amount arrives as a decimal string of minor units so it never becomes a float. */
export const amountMinorSchema = z
  .string()
  .regex(/^\d+$/, 'Amount must be whole minor units')
  .refine((v) => BigInt(v) > 0n, 'Amount must be greater than zero')
  .refine((v) => BigInt(v) <= 10n ** 13n, 'Amount is implausibly large');

export const entryTypeSchema = z.enum(['expense', 'income']);
export const accountKindSchema = z.enum(['cash', 'bank', 'upi', 'other']);
export const roleSchema = z.enum(ROLES);

export const entryInputSchema = z.object({
  client_id: uuidSchema,
  business_id: uuidSchema,
  type: entryTypeSchema,
  amount_minor: amountMinorSchema,
  account_id: uuidSchema,
  category_id: uuidSchema.nullable().optional(),
  party_id: uuidSchema.nullable().optional(),
  party_name: z.string().trim().min(1).max(80).nullable().optional(),
  note: z.string().trim().max(280).nullable().optional(),
  occurred_at: z.string().datetime({ offset: true }),
  attachment_path: z.string().max(400).nullable().optional(),
  source: z.enum(['app', 'whatsapp']).default('app'),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

export const entryPatchSchema = entryInputSchema
  .partial()
  .omit({ client_id: true, business_id: true })
  .extend({ id: uuidSchema });
export type EntryPatch = z.infer<typeof entryPatchSchema>;

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required').max(80),
  currency: z.string().length(3).toUpperCase(),
  locale: z.string().min(2).max(10),
  timezone: z.string().min(1).max(64),
  starting_balance_minor: z.string().regex(/^-?\d+$/).default('0'),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, 'PIN must be exactly 4 digits')
  .refine((v) => new Set(v).size > 1, 'PIN cannot be four identical digits');

export const exportRangeSchema = z
  .object({
    business_id: uuidSchema,
    from: z.string().date(),
    to: z.string().date(),
  })
  .refine((v) => v.from <= v.to, { message: 'End date must be on or after the start date', path: ['to'] });
export type ExportRange = z.infer<typeof exportRangeSchema>;

export const linkCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, 'Link codes are 6 characters');

export const phoneE164Schema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format');

/** The slice of Meta's webhook payload we rely on. Unknown keys are ignored, not rejected. */
export const whatsappInboundSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          field: z.string().optional(),
          value: z.object({
            messaging_product: z.string().optional(),
            metadata: z.object({ phone_number_id: z.string().optional() }).optional(),
            contacts: z
              .array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string() }).partial().optional() }))
              .optional(),
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  timestamp: z.string().optional(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                  image: z.object({ id: z.string(), caption: z.string().optional(), mime_type: z.string().optional() }).optional(),
                }),
              )
              .optional(),
            statuses: z.array(z.unknown()).optional(),
          }),
        }),
      ),
    }),
  ),
});
export type WhatsappInbound = z.infer<typeof whatsappInboundSchema>;

// ---------------------------------------------------------------------------
// P1 input shapes
// ---------------------------------------------------------------------------

export const cadenceSchema = z.enum(['weekly', 'monthly']);

export const recurringInputSchema = z
  .object({
    business_id: uuidSchema,
    type: entryTypeSchema.default('expense'),
    amount_minor: amountMinorSchema,
    account_id: uuidSchema,
    category_id: uuidSchema.nullable().optional(),
    party_name: z.string().trim().min(1).max(80).nullable().optional(),
    note: z.string().trim().max(280).nullable().optional(),
    cadence: cadenceSchema,
    day_of_month: z.number().int().min(1).max(31).nullable().optional(),
    day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  })
  .refine(
    (v) => (v.cadence === 'monthly' ? v.day_of_month != null : v.day_of_week != null),
    { message: 'Pick the day this repeats on', path: ['day_of_month'] },
  );
export type RecurringInput = z.infer<typeof recurringInputSchema>;

export const budgetInputSchema = z.object({
  business_id: uuidSchema,
  category_id: uuidSchema,
  amount_minor: amountMinorSchema,
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, 'Invite codes are 6 characters');

/** GSTIN: 2-digit state, 10-char PAN, entity digit, 'Z', checksum. */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    'That does not look like a valid GSTIN',
  );

/** Tax must be part of the amount, never on top of it. */
export const taxAmountSchema = z.string().regex(/^\d+$/, 'Tax must be whole minor units');
