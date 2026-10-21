import { config } from './config';
import { maskPii } from './pii';

export type LeadClassification = { maskedText: string; intent: 'high' | 'medium' | 'low' | 'unknown'; stage: 'cold' | 'warm' | 'hot' | 'unknown'; summary: string };

export async function classifyLead(text: string): Promise<LeadClassification> {
  if (!config.OLLAMA_BASE_URL) throw new Error('OLLAMA_BASE_URL belum dikonfigurasi.');
  const maskedText = maskPii(text).slice(0, 6000);
  const response = await fetch(`${config.OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.LOCAL_AI_MODEL,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: 'Klasifikasikan pesan lead berbahasa Indonesia. Jangan menebak fakta. Jawab JSON saja dengan maskedText, intent (high|medium|low|unknown), stage (cold|warm|hot|unknown), summary singkat. Pertahankan placeholder [PHONE] dan [EMAIL].' },
        { role: 'user', content: maskedText },
      ],
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Local AI gagal (${response.status}).`);
  const payload = await response.json() as { message?: { content?: string } };
  const result = JSON.parse(payload.message?.content ?? '{}') as Partial<LeadClassification>;
  const enums = ['high', 'medium', 'low', 'unknown'];
  const stages = ['cold', 'warm', 'hot', 'unknown'];
  return {
    maskedText: maskPii(String(result.maskedText || maskedText)).slice(0, 6000),
    intent: enums.includes(String(result.intent)) ? result.intent as LeadClassification['intent'] : 'unknown',
    stage: stages.includes(String(result.stage)) ? result.stage as LeadClassification['stage'] : 'unknown',
    summary: maskPii(String(result.summary || '')).slice(0, 500),
  };
}

export async function generateExternalInsight(input: unknown) {
  if (!config.EXTERNAL_AI_BASE_URL || !config.EXTERNAL_AI_API_KEY || !config.EXTERNAL_AI_MODEL) throw new Error('External AI belum dikonfigurasi.');
  const response = await fetch(`${config.EXTERNAL_AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.EXTERNAL_AI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.EXTERNAL_AI_MODEL, temperature: 0.2, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'Hasilkan JSON insight funnel sebagai hipotesis, jangan menyatakan korelasi sebagai sebab. Gunakan hanya data yang diberikan dan sertakan keterbatasan.' },
      { role: 'user', content: maskPii(JSON.stringify(input)).slice(0, 20000) },
    ] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`External AI gagal (${response.status}).`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return JSON.parse(payload.choices?.[0]?.message?.content ?? '{}');
}

export async function generateBrandOptions(input: { business: Record<string, unknown>; preference: string; emphasis: string; round: number }) {
  if (!config.EXTERNAL_AI_BASE_URL || !config.EXTERNAL_AI_API_KEY || !config.EXTERNAL_AI_MODEL) throw new Error('External AI belum dikonfigurasi.');
  const response = await fetch(`${config.EXTERNAL_AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${config.EXTERNAL_AI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.EXTERNAL_AI_MODEL, temperature: 0.6, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'Buat tepat tiga opsi identitas brand bahasa Indonesia berdasarkan fakta yang diberikan. Jangan mengubah klaim produk, jangan menyatakan nama tersedia secara hukum. Balas JSON {"options":[{"name":"...","tagline":"...","positioning":"...","tone":"...","colors":["#112233","#445566"]}]}.' },
      { role: 'user', content: maskPii(JSON.stringify(input)).slice(0, 8000) },
    ] }), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`External AI gagal (${response.status}).`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const result = JSON.parse(payload.choices?.[0]?.message?.content ?? '{}') as { options?: Array<Record<string, unknown>> };
  if (!Array.isArray(result.options) || result.options.length !== 3) throw new Error('AI tidak mengembalikan tiga opsi brand yang valid.');
  return result.options.map((option, index) => ({
    id: `${input.round}-${index}`, name: String(option.name ?? '').slice(0, 120), tagline: String(option.tagline ?? '').slice(0, 240),
    positioning: String(option.positioning ?? '').slice(0, 1000), tone: String(option.tone ?? '').slice(0, 240),
    colors: Array.isArray(option.colors) ? option.colors.map(String).filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 4) : [],
  }));
}
