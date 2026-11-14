export interface Source { title: string; url: string }

export interface Ingredient {
  id: number;
  inciName: string;
  commonName: string | null;
  nameKk: string;
  formula: string;
  chemClass: string;
  molarMass: number | null;
  molarMassNote: string | null;
  cas: string | null;
  properties: string;
  functionKk: string;
  categories: string[];
  mechanism: string | null;
  benefits: string | null;
  risks: string | null;
  synonyms: string[];
  pubchemQuery: string | null;
  sources: Source[];
  isCustom: boolean;
}

export interface ProductInfo {
  brand: string | null;
  productName: string | null;
  productType: string | null;
  category: string | null;
  volume: string | null;
  spf: string | null;
  packagingTexts: string[];
  confidence: number;
  ingredientsVisible: boolean;
  inciText: string | null;
  alternatives: { brand: string; productName: string }[];
  notes: string | null;
}

export interface MatchItem {
  position: number;
  raw: string;
  optional: boolean;
  key: string;
  match: Ingredient | null;
}

export interface MatchResult {
  items: MatchItem[];
  stats: { total: number; matched: number; unmatched: number; byCategory: Record<string, number> };
}

export interface LocalProduct {
  id: number;
  brand: string;
  name: string;
  productType: string | null;
  volume: string | null;
  market: string | null;
  formulaYear: string | null;
  inciText: string;
  sourceUrl: string | null;
  sourceNote: string | null;
}

export interface WebLookup {
  found: boolean;
  reason?: string;
  inciText?: string;
  items?: { raw: string; optional: boolean }[];
  sourceName?: string | null;
  claimedUrl?: string | null;
  sourceType?: 'official' | 'catalog' | 'other';
  variantNote?: string | null;
  exactProductMatch?: boolean;
  sources: Source[];
}

export interface OcrResult {
  inciText: string | null;
  readable: boolean;
  language: string | null;
  uncertainParts: string[];
  notes: string | null;
}

/** INCI мәтінінің қайдан алынғанын сипаттайды (ғылыми шынайылық үшін). */
export interface InciOrigin {
  kind: 'label' | 'ocr' | 'local' | 'web' | 'manual';
  sourceName?: string | null;
  sources?: Source[];
  note?: string | null;
}

export interface AnalysisResult {
  product: {
    brand: string | null;
    name: string | null;
    type: string | null;
    category: string | null;
    volume: string | null;
    spf: string | null;
    confidence: number | null;
  };
  inciText: string;
  origin: InciOrigin;
  match: MatchResult;
  summary: string | null;
  createdAt: string;
}

export interface HistoryListItem {
  id: number;
  brand: string | null;
  productName: string | null;
  productType: string | null;
  thumb: string | null;
  createdAt: string;
}

export interface HistoryFull extends HistoryListItem {
  result: AnalysisResult;
}

export interface HealthInfo {
  ok: boolean;
  geminiConfigured: boolean;
  model: string;
  ingredientCount: number;
}
