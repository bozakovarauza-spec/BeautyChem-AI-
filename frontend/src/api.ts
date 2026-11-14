import { getDeviceId } from './lib/device';
import type {
  AnalysisResult, HealthInfo, HistoryFull, HistoryListItem, Ingredient, LocalProduct,
  MatchResult, OcrResult, ProductInfo, WebLookup,
} from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Device-Id', getDeviceId());
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let res: Response;
  try {
    res = await fetch('https://beautychem-ai.onrender.com/api' + path, { ...init, headers });
  } catch {
    throw new ApiError(0, 'network', navigator.onLine ? 'Серверге қосылу мүмкін болмады.' : 'Интернет байланысы жоқ.');
  }
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data: unknown = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code || 'error', e?.message || `Қате (HTTP ${res.status})`);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

function imageForm(blob: Blob): FormData {
  const fd = new FormData();
  fd.append('image', blob, 'photo.jpg');
  return fd;
}

export const api = {
  health: () => request<HealthInfo>('/health'),

  ingredients: (p: { q?: string; category?: string; class?: string }) => {
    const qs = new URLSearchParams();
    if (p.q) qs.set('q', p.q);
    if (p.category) qs.set('category', p.category);
    if (p.class) qs.set('class', p.class);
    return request<{ items: Ingredient[]; total: number }>(`/ingredients?${qs}`);
  },
  ingredientMeta: () => request<{ categories: string[]; classes: string[]; total: number }>('/ingredients/meta'),
  ingredient: (id: number | string) => request<Ingredient>(`/ingredients/${id}`),
  createIngredient: (body: Record<string, unknown>) => request<Ingredient>('/ingredients', json(body)),
  deleteIngredient: (id: number) => request<{ ok: boolean }>(`/ingredients/${id}`, { method: 'DELETE' }),

  analyze: (blob: Blob) => request<ProductInfo>('/analyze', { method: 'POST', body: imageForm(blob) }),
  ocr: (blob: Blob) => request<OcrResult>('/inci/ocr', { method: 'POST', body: imageForm(blob) }),
  lookup: (body: { brand: string | null; productName: string; volume?: string | null; market?: string; forceWeb?: boolean }) =>
    request<{ local: LocalProduct[]; web: WebLookup | null }>('/inci/lookup', json(body)),
  match: (text: string) => request<MatchResult>('/inci/match', json({ text })),
  explain: (inciText: string, product: { brand: string | null; name: string | null; type: string | null }) =>
    request<{ summary: string }>('/inci/explain', json({ inciText, product })),

  saveProduct: (body: Record<string, unknown>) => request<{ id: number }>('/products', json(body)),

  history: () => request<{ items: HistoryListItem[] }>('/history'),
  historyItem: (id: number | string) => request<HistoryFull>(`/history/${id}`),
  saveHistory: (body: { brand: string | null; productName: string | null; productType: string | null; thumb: string | null; result: AnalysisResult }) =>
    request<{ id: number }>('/history', json(body)),
  updateSummary: (id: number, summary: string) => request<{ ok: boolean }>(`/history/${id}/summary`, { method: 'PUT', body: JSON.stringify({ summary }) }),
  deleteHistory: (id: number) => request<{ ok: boolean }>(`/history/${id}`, { method: 'DELETE' }),
  clearHistory: () => request<{ ok: boolean }>('/history', { method: 'DELETE' }),

  molecule: (q: string) => request<string>(`/molecule?q=${encodeURIComponent(q)}`),
};
