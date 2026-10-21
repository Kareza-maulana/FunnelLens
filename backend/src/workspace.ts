import { z } from 'zod';
import { asActor } from './database';
import type { Owner } from './auth';

export const workspaceSchema = z.object({
  version: z.literal(1),
  business: z.object({ name: z.string().trim().min(1).max(160), category: z.string().max(120).default(''), product: z.string().max(200).default(''), price: z.union([z.number(), z.string()]).default(''), benefits: z.string().max(4000).default(''), audience: z.string().max(1000).default(''), area: z.string().max(1000).default('') }).passthrough(),
  brand: z.object({ options: z.array(z.unknown()).default([]) }).passthrough().optional(),
  onboarding: z.object({ maxStep: z.number().int().min(1).max(6).default(1), completed: z.boolean().default(false) }).passthrough().optional(),
}).passthrough();

export async function loadWorkspace(owner: Owner) {
  return asActor(owner.id, async (tx) => {
    const [row] = await tx`select onboarding_draft from app.business_profile where id=1`;
    return row?.onboarding_draft ?? null;
  });
}

export async function saveWorkspace(owner: Owner, workspace: z.infer<typeof workspaceSchema>) {
  const business = workspace.business;
  const productName = String(business.product || '').trim() || 'Produk utama';
  const benefits = String(business.benefits || '').split(/[;,\n]/).map((s) => s.trim()).filter(Boolean);
  return asActor(owner.id, async (tx) => {
    const [saved] = await tx`
      insert into app.business_profile
        (id,name,industry,description,target_market,selected_brand,brand_options,onboarding_draft,onboarding_step,completed_at)
      values
        (1,${business.name},${business.category || null},${productName},${tx.json({ audience: business.audience || '', area: business.area || '' })},
         ${tx.json(workspace.brand ?? {})},${tx.json(workspace.brand?.options ?? [])},${tx.json(workspace)},
         ${Number(workspace.onboarding?.maxStep ?? 1)},${workspace.onboarding?.completed ? new Date() : null})
      on conflict (id) do update set
        name=excluded.name, industry=excluded.industry, description=excluded.description, target_market=excluded.target_market,
        selected_brand=excluded.selected_brand, brand_options=excluded.brand_options, onboarding_draft=excluded.onboarding_draft,
        onboarding_step=excluded.onboarding_step, completed_at=excluded.completed_at, revision=app.business_profile.revision+1, updated_at=now()
      returning revision
    `;
    await tx`
      insert into app.products(sku,name,price,currency,verified_benefits,media,active)
      values ('workspace-main',${productName},${Math.max(0, Number(business.price) || 0)},'IDR',${tx.json(benefits)},'[]'::jsonb,true)
      on conflict (sku) do update set name=excluded.name,price=excluded.price,verified_benefits=excluded.verified_benefits,active=true,revision=app.products.revision+1,updated_at=now()
    `;
    return { revision: saved.revision };
  });
}

export async function clearWorkspace(owner: Owner) {
  return asActor(owner.id, async (tx) => {
    await tx`delete from app.business_profile where id=1`;
    await tx`update app.products set active=false,revision=revision+1,updated_at=now() where sku='workspace-main' and active=true`;
    return { ok: true };
  });
}
