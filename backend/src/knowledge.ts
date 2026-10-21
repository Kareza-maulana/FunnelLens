import { createHash } from 'node:crypto';
import { z } from 'zod';
import { asActor, asConfiguredOwner, sql } from './database';
import type { Owner } from './auth';
import { ApiError } from './auth';
import { config } from './config';
import { maskPii } from './pii';

export const createEmbeddingProfileSchema = z.object({
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  modelRevision: z.string().trim().min(1).max(100).default('v1'),
  dimensions: z.coerce.number().int().min(1).max(10000),
  preprocessingVersion: z.string().trim().min(1).max(100).default('v1'),
  normalized: z.boolean().default(false),
});
export type CreateEmbeddingProfileInput = z.infer<typeof createEmbeddingProfileSchema>;

export const sourceTypeEnum = z.enum(['guide', 'business_fact', 'brand', 'rubric', 'creative_guide']);
export type SourceType = z.infer<typeof sourceTypeEnum>;

export const createDocumentSchema = z.object({
  sourceKey: z.string().trim().min(1).max(255),
  sourceType: sourceTypeEnum,
  sourceRef: z.string().trim().min(1).max(1024),
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1),
  extractionVersion: z.string().trim().min(1).max(50).default('v1'),
  chunkingVersion: z.string().trim().min(1).max(50).default('v1'),
  chunkSize: z.coerce.number().int().min(10).max(8192).default(512),
  overlapSize: z.coerce.number().int().min(0).max(1024).default(64),
  locator: z.record(z.string(), z.unknown()).default({}),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const searchKnowledgeSchema = z.object({
  query: z.string().trim().min(1).max(4000),
  profileId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;

/**
 * Splits text into chunks by paragraphs and merges until target token count is reached.
 * A rough token estimate is words * 1.3.
 */
export function chunkText(
  text: string,
  chunkSize = 512,
  overlapSize = 64
): Array<{ content: string; tokenEstimate: number }> {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const targetWords = Math.max(10, Math.round(chunkSize / 1.3));
  const overlapWords = Math.max(0, Math.round(overlapSize / 1.3));

  const paragraphs = normalized.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);

  const units: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length <= targetWords) {
      units.push(para);
    } else {
      const sentences = para.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
      let currentSub = '';
      for (const sentence of sentences) {
        const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;
        const currentWords = currentSub ? currentSub.split(/\s+/).filter(Boolean).length : 0;
        if (currentWords + sentenceWords > targetWords && currentSub) {
          units.push(currentSub);
          currentSub = sentence;
        } else {
          currentSub = currentSub ? `${currentSub} ${sentence}` : sentence;
        }
      }
      if (currentSub) {
        const remainingWords = currentSub.split(/\s+/).filter(Boolean);
        if (remainingWords.length > targetWords) {
          for (let i = 0; i < remainingWords.length; i += targetWords) {
            units.push(remainingWords.slice(i, i + targetWords).join(' '));
          }
        } else {
          units.push(currentSub);
        }
      }
    }
  }

  const chunks: Array<{ content: string; tokenEstimate: number }> = [];
  let currentUnits: string[] = [];
  let currentWordsCount = 0;

  for (const unit of units) {
    const unitWords = unit.split(/\s+/).filter(Boolean).length;
    if (currentWordsCount + unitWords > targetWords && currentUnits.length > 0) {
      const chunkStr = currentUnits.join('\n\n');
      const totalWords = chunkStr.split(/\s+/).filter(Boolean).length;
      chunks.push({
        content: chunkStr,
        tokenEstimate: Math.round(totalWords * 1.3),
      });

      if (overlapWords > 0) {
        const words = chunkStr.split(/\s+/).filter(Boolean);
        const overlap = words.slice(-overlapWords).join(' ');
        currentUnits = [overlap, unit];
        currentWordsCount = overlap.split(/\s+/).filter(Boolean).length + unitWords;
      } else {
        currentUnits = [unit];
        currentWordsCount = unitWords;
      }
    } else {
      currentUnits.push(unit);
      currentWordsCount += unitWords;
    }
  }

  if (currentUnits.length > 0) {
    const chunkStr = currentUnits.join('\n\n');
    const totalWords = chunkStr.split(/\s+/).filter(Boolean).length;
    chunks.push({
      content: chunkStr,
      tokenEstimate: Math.round(totalWords * 1.3),
    });
  }

  if (chunks.length === 0 && normalized.length > 0) {
    const totalWords = normalized.split(/\s+/).filter(Boolean).length;
    chunks.push({
      content: normalized,
      tokenEstimate: Math.max(1, Math.round(totalWords * 1.3)),
    });
  }

  return chunks;
}

export async function createEmbeddingProfile(owner: Owner, inputValue: unknown) {
  const input = createEmbeddingProfileSchema.parse(inputValue);
  return asActor(owner.id, async (tx) => {
    const [row] = await tx`
      insert into app.embedding_profiles(
        provider, model, model_revision, dimensions, distance_metric, preprocessing_version, normalized
      )
      values (
        ${input.provider}, ${input.model}, ${input.modelRevision}, ${input.dimensions}, 'cosine', ${input.preprocessingVersion}, ${input.normalized}
      )
      returning id
    `;
    return { id: row.id as string };
  });
}

export async function activateEmbeddingProfile(owner: Owner, profileId: string) {
  const id = z.string().uuid().parse(profileId);
  return asConfiguredOwner(async (tx) => {
    await tx`select app.activate_embedding_profile(${id}::uuid)`;
    return { ok: true, profileId: id };
  });
}

export async function listEmbeddingProfiles(owner: Owner) {
  return asActor(owner.id, async (tx) => {
    return tx`
      select id, provider, model, model_revision, dimensions, distance_metric, preprocessing_version, normalized, is_active, created_at
      from app.embedding_profiles
      order by created_at desc
    `;
  });
}

export async function createDocument(owner: Owner, inputValue: unknown) {
  const input = createDocumentSchema.parse(inputValue);
  const contentHash = createHash('sha256').update(input.content).digest('hex');
  const chunks = chunkText(input.content, input.chunkSize, input.overlapSize);

  return asActor(owner.id, async (tx) => {
    const [{ next_version }] = await tx`
      select coalesce(max(version), 0) + 1 as next_version
      from app.knowledge_documents
      where source_key = ${input.sourceKey}
    `;
    const version = Number(next_version);

    const [doc] = await tx`
      insert into app.knowledge_documents(
        source_key, source_type, source_ref, title, version,
        content_hash, locator, extraction_version, chunking_version,
        expected_chunks, approval_status, ingest_status
      )
      values (
        ${input.sourceKey}, ${input.sourceType}, ${input.sourceRef}, ${input.title}, ${version},
        ${contentHash}, ${tx.json(input.locator)}, ${input.extractionVersion}, ${input.chunkingVersion},
        ${chunks.length}, 'draft', 'processing'
      )
      returning id
    `;

    const activeProfiles = await tx`
      select id from app.embedding_profiles where is_active = true
    `;

    for (const profile of activeProfiles) {
      for (let i = 0; i < chunks.length; i++) {
        await tx`
          insert into app.knowledge_chunks(
            document_id, chunk_index, content, locator,
            embedding_profile_id, status, token_estimate
          )
          values (
            ${doc.id}, ${i}, ${chunks[i].content}, ${tx.json({ chunkIndex: i })},
            ${profile.id}, 'pending', ${chunks[i].tokenEstimate}
          )
        `;
      }
    }

    return { id: doc.id as string, expectedChunks: chunks.length, version };
  });
}

export async function approveDocument(owner: Owner, documentId: string) {
  const id = z.string().uuid().parse(documentId);
  return asActor(owner.id, async (tx) => {
    await tx`select app.approve_document(${id}::uuid, true)`;
    return { ok: true, documentId: id, approvalStatus: 'approved' };
  });
}

export async function rejectDocument(owner: Owner, documentId: string) {
  const id = z.string().uuid().parse(documentId);
  return asActor(owner.id, async (tx) => {
    await tx`select app.approve_document(${id}::uuid, false)`;
    return { ok: true, documentId: id, approvalStatus: 'rejected' };
  });
}

export async function embedChunks(documentId: string, profileId: string) {
  const docId = z.string().uuid().parse(documentId);
  const profId = z.string().uuid().parse(profileId);

  if (!config.EXTERNAL_AI_BASE_URL || !config.EXTERNAL_AI_API_KEY) {
    throw new Error('External AI belum dikonfigurasi.');
  }

  return asConfiguredOwner(async (tx) => {
    const [profile] = await tx`
      select id, provider, model, dimensions
      from app.embedding_profiles
      where id = ${profId}
    `;
    if (!profile) {
      throw new Error(`Embedding profile tidak ditemukan: ${profId}`);
    }

    let pendingChunks = await tx`
      select id, chunk_index, content
      from app.knowledge_chunks
      where document_id = ${docId}
        and embedding_profile_id = ${profId}
        and status = 'pending'
      order by chunk_index asc
    `;

    if (pendingChunks.length === 0) {
      const [existing] = await tx`
        select id from app.knowledge_chunks
        where document_id = ${docId} and embedding_profile_id = ${profId}
        limit 1
      `;
      if (!existing) {
        const baseChunks = await tx`
          select distinct on (chunk_index) chunk_index, content, locator, token_estimate
          from app.knowledge_chunks
          where document_id = ${docId}
          order by chunk_index asc
        `;
        if (baseChunks.length > 0) {
          for (const bc of baseChunks) {
            await tx`
              insert into app.knowledge_chunks(
                document_id, chunk_index, content, locator,
                embedding_profile_id, status, token_estimate
              )
              values (
                ${docId}, ${bc.chunk_index}, ${bc.content}, ${tx.json(bc.locator ?? { chunkIndex: bc.chunk_index })},
                ${profId}, 'pending', ${bc.token_estimate}
              )
              on conflict (document_id, chunk_index, embedding_profile_id) do nothing
            `;
          }
          pendingChunks = await tx`
            select id, chunk_index, content
            from app.knowledge_chunks
            where document_id = ${docId}
              and embedding_profile_id = ${profId}
              and status = 'pending'
            order by chunk_index asc
          `;
        }
      }
    }

    if (pendingChunks.length === 0) {
      return { documentId: docId, profileId: profId, totalChunks: 0, processedChunks: 0, failedChunks: 0 };
    }

    const baseUrl = config.EXTERNAL_AI_BASE_URL.replace(/\/$/, '');
    let processedChunks = 0;
    let failedChunks = 0;

    const BATCH_SIZE = 16;
    for (let i = 0; i < pendingChunks.length; i += BATCH_SIZE) {
      const batch = pendingChunks.slice(i, i + BATCH_SIZE);
      const chunkTexts = batch.map((c: { content: string }) => c.content);

      try {
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.EXTERNAL_AI_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ model: profile.model, input: chunkTexts }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Embedding API gagal (${response.status}): ${errText || response.statusText}`);
        }

        const result = await response.json() as {
          data?: Array<{ embedding?: number[]; index?: number }>;
        };
        const dataArr = result.data ?? [];

        for (let bIdx = 0; bIdx < batch.length; bIdx++) {
          const chunk = batch[bIdx];
          const embItem = dataArr.find((item) => item.index === bIdx) ?? dataArr[bIdx];
          const embedding = embItem?.embedding;

          if (!Array.isArray(embedding) || embedding.length !== profile.dimensions) {
            const err = `Dimensi embedding tidak sesuai (${embedding?.length ?? 0} vs ${profile.dimensions}).`;
            await tx`
              update app.knowledge_chunks
              set status = 'failed', error_summary = ${err}
              where id = ${chunk.id}
            `;
            failedChunks++;
          } else {
            const vectorStr = `[${embedding.join(',')}]`;
            await tx`
              update app.knowledge_chunks
              set embedding = ${vectorStr}::vector, status = 'ready', error_summary = null
              where id = ${chunk.id}
            `;
            processedChunks++;
          }
        }
      } catch (batchError) {
        const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
        for (const chunk of batch) {
          await tx`
            update app.knowledge_chunks
            set status = 'failed', error_summary = ${errorMessage.slice(0, 500)}
            where id = ${chunk.id}
          `;
          failedChunks++;
        }
      }
    }

    const [counts] = await tx`
      select
        count(*) filter (where status = 'pending') as pending_count,
        count(*) filter (where status = 'failed') as failed_count
      from app.knowledge_chunks
      where document_id = ${docId}
    `;

    const remainingPending = Number(counts?.pending_count ?? 0);
    const totalFailed = Number(counts?.failed_count ?? 0);

    if (remainingPending === 0) {
      const finalIngestStatus = totalFailed > 0 ? 'failed' : 'ready';
      const summaryMsg = totalFailed > 0 ? `${totalFailed} chunk gagal diproses.` : null;
      await tx`
        update app.knowledge_documents
        set ingest_status = ${finalIngestStatus}, error_summary = ${summaryMsg}
        where id = ${docId}
      `;
    }

    return {
      documentId: docId,
      profileId: profId,
      totalChunks: pendingChunks.length,
      processedChunks,
      failedChunks,
    };
  });
}

export async function publishDocument(owner: Owner, documentId: string, profileId: string) {
  const docId = z.string().uuid().parse(documentId);
  const profId = z.string().uuid().parse(profileId);
  return asConfiguredOwner(async (tx) => {
    await tx`select app.publish_document(${docId}::uuid, ${profId}::uuid)`;
    return { ok: true, documentId: docId, profileId: profId };
  });
}

export async function searchKnowledge(owner: Owner, inputValue: unknown) {
  const input = searchKnowledgeSchema.parse(inputValue);

  if (!config.EXTERNAL_AI_BASE_URL || !config.EXTERNAL_AI_API_KEY) {
    throw new ApiError(503, 'External AI belum dikonfigurasi untuk pencarian knowledge.');
  }

  const profile = await asActor(owner.id, async (tx) => {
    if (input.profileId) {
      const [p] = await tx`
        select id, provider, model, dimensions
        from app.embedding_profiles
        where id = ${input.profileId}
      `;
      return p;
    }
    const [active] = await tx`
      select id, provider, model, dimensions
      from app.embedding_profiles
      where is_active = true
      limit 1
    `;
    return active;
  });

  if (!profile) {
    throw new ApiError(404, 'Embedding profile tidak ditemukan atau belum ada profil aktif.');
  }

  const baseUrl = config.EXTERNAL_AI_BASE_URL.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.EXTERNAL_AI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: profile.model, input: [maskPii(input.query)] }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new ApiError(502, `External AI embeddings gagal (${response.status}).`);
  }

  const result = await response.json() as { data?: Array<{ embedding?: number[] }> };
  const queryEmbedding = result.data?.[0]?.embedding;
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    throw new ApiError(502, 'AI tidak mengembalikan embedding query yang valid.');
  }

  const queryVector = `[${queryEmbedding.join(',')}]`;
  return asActor(owner.id, async (tx) => {
    return tx`
      select * from app.search_knowledge(${profile.id}::uuid, ${queryVector}::vector, ${input.limit})
    `;
  });
}

export async function listDocuments(owner: Owner) {
  return asActor(owner.id, async (tx) => {
    return tx`
      select id, source_key, source_type, title, version, approval_status, ingest_status,
        expected_chunks, effective_at, published_at, retired_at, created_at
      from app.knowledge_documents
      order by source_key, version desc
    `;
  });
}

export async function getDocumentChunks(owner: Owner, documentId: string) {
  const id = z.string().uuid().parse(documentId);
  return asActor(owner.id, async (tx) => {
    return tx`
      select c.id, c.chunk_index, c.content, c.status, c.token_estimate, c.error_summary,
        p.provider, p.model
      from app.knowledge_chunks c
      join app.embedding_profiles p on p.id = c.embedding_profile_id
      where c.document_id = ${id}
      order by c.chunk_index
    `;
  });
}

export async function enqueueEmbedJob(owner: Owner, documentId: string, profileId: string) {
  const docId = z.string().uuid().parse(documentId);
  const profId = z.string().uuid().parse(profileId);
  const dedupeKey = `embed:${docId}:${profId}`;
  const jobInput = { documentId: docId, profileId: profId };

  return asActor(owner.id, async (tx) => {
    const [row] = await tx`
      select app.enqueue_read_job('embed', ${dedupeKey}, null, ${tx.json(jobInput)}::jsonb) as id
    `;
    return { jobId: row.id as string, dedupeKey };
  });
}
