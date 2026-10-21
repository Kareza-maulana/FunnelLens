import { z } from 'zod';
import { asActor } from './database';
import type { Owner } from './auth';
import { ApiError } from './auth';

export const confirmPurchaseSchema = z.object({
  eventId: z.string().uuid({ message: 'Event ID harus berupa UUID yang valid.' }),
  amount: z.coerce.number().positive({ message: 'Nominal pembelian harus lebih besar dari 0.' }),
  currency: z.string().trim().length(3).regex(/^[A-Z]{3}$/, 'Mata uang harus 3 karakter huruf kapital (contoh: IDR).').default('IDR'),
  orderId: z.string().trim().min(1).optional().nullable(),
});

export type ConfirmPurchaseInput = z.infer<typeof confirmPurchaseSchema>;

export type Conversion = {
  id: string;
  kind: 'purchase' | 'refund';
  status: 'pending' | 'confirmed' | 'void';
  amount: number | null;
  currency: string;
  occurred_at: Date;
  confirmed_at: Date | null;
  confirmation_method: 'manual' | 'provider_verified' | null;
  is_new_customer: boolean | null;
  external_order_id: string | null;
  source_system: string;
  campaign_id: string | null;
  lead_id: string | null;
};

export async function confirmPurchase(owner: Owner, input: unknown): Promise<{ conversionId: string }> {
  const parsed = confirmPurchaseSchema.parse(input);

  return asActor(owner.id, async (tx) => {
    try {
      const [result] = await tx<{ id: string }[]>`
        select app.confirm_purchase(
          ${parsed.eventId}::uuid,
          ${parsed.amount},
          ${parsed.currency},
          ${parsed.orderId ?? null}
        ) as id
      `;

      if (!result?.id) {
        throw new ApiError(500, 'Gagal mencatat konversi pembelian.');
      }

      return { conversionId: result.id };
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      if (error?.code === 'P0002') {
        throw new ApiError(404, 'Event bukti pembelian tidak ditemukan.');
      }
      if (error?.code === '23514') {
        throw new ApiError(400, `Validasi konversi gagal: ${error.message}`);
      }
      if (error?.code === '23505') {
        throw new ApiError(409, 'Konversi pembelian untuk order atau event ini sudah pernah dicatat.');
      }
      throw error;
    }
  });
}

export const listConversionsFilterSchema = z.object({
  campaignId: z.string().uuid({ message: 'Campaign ID harus berupa UUID yang valid.' }).optional().nullable(),
  status: z.enum(['pending', 'confirmed', 'void'], { message: 'Status harus pending, confirmed, atau void.' }).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
}).default({ limit: 100 });

export type ListConversionsFilter = z.infer<typeof listConversionsFilterSchema>;

export async function listConversions(owner: Owner, filters?: unknown): Promise<Conversion[]> {
  const parsed = listConversionsFilterSchema.parse(filters);
  const campaignId = parsed.campaignId ?? null;
  const status = parsed.status ?? null;
  const limit = parsed.limit ?? 100;

  return asActor(owner.id, async (tx) => {
    const rows = await tx<Conversion[]>`
      select c.id, c.kind, c.status, c.amount, c.currency, c.occurred_at, c.confirmed_at, c.confirmation_method, c.is_new_customer, c.external_order_id,
        c.source_system, c.campaign_id, c.lead_id
      from app.conversions c
      where (${campaignId}::uuid is null or c.campaign_id = ${campaignId}::uuid)
        and (${status}::text is null or c.status = ${status})
      order by c.occurred_at desc limit ${limit}
    `;

    return rows;
  });
}
