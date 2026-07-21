const normalizeSlug = (slug) => String(slug || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const normalizeString = (value) => String(value || '').trim().toLowerCase();

const dataUrl = (fileName) => `/src/data/grow-garden-2/${fileName}`;

export class SeedDataService {
  constructor() {
    this.cache = null;
    this.imagesCache = null;
  }

  async fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao buscar ${url}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Arquivo de catálogo não retornou JSON válido: ${url}`);
    }
    return response.json();
  }

  async loadData() {
    if (this.cache) return this.cache;

    const [seedsData, imagesData] = await Promise.all([
      this.fetchJson(dataUrl('seeds.json')),
      this.fetchJson(dataUrl('seed-images.json'))
    ]);

    const imageEntries = Array.isArray(imagesData) ? imagesData : [];
    const imageMap = new Map(imageEntries.map((entry) => [normalizeSlug(entry.seedSlug), entry]));

    const seeds = (Array.isArray(seedsData.seeds) ? seedsData.seeds : []).map((seed) => {
      const slug = normalizeSlug(seed.slug);
      const imageEntry = imageMap.get(slug);
      const imagePath = imageEntry?.image || seed.image || null;
      const imageStatus = seed.imageStatus || imageEntry?.usageStatus || (imagePath ? 'pending' : 'missing');

      return {
        ...seed,
        slug,
        name: String(seed.name || '').trim(),
        image: imagePath,
        imageStatus,
        rarity: seed.rarity || 'Em revisão',
        purchasePrice: Number.isFinite(seed.purchasePrice) ? seed.purchasePrice : null,
        priceMin: Number.isFinite(seed.priceMin) ? seed.priceMin : null,
        priceMax: Number.isFinite(seed.priceMax) ? seed.priceMax : null,
        currency: seed.currency || 'Sheckles',
        stockMin: Number.isFinite(seed.stockMin) ? seed.stockMin : null,
        stockMax: Number.isFinite(seed.stockMax) ? seed.stockMax : null,
        stockChance: Number.isFinite(seed.stockChance) ? seed.stockChance : null,
        obtainMethod: seed.obtainMethod || 'em revisão',
        obtainable: typeof seed.obtainable === 'boolean' ? seed.obtainable : null,
        sources: Array.isArray(seed.sources) ? seed.sources : [],
        confidence: seed.confidence || 'unknown',
        verifiedAt: seed.verifiedAt || null,
        imageSourceType: imageEntry?.sourceType || null,
        imageMetadata: imageEntry || null
      };
    });

    this.cache = seeds;
    return seeds;
  }

  async getAll() {
    return this.loadData();
  }

  async getBySlug(slug) {
    const normalized = normalizeSlug(slug);
    return (await this.loadData()).find((seed) => seed.slug === normalized) || null;
  }

  async search(query) {
    const normalized = normalizeString(query);
    if (!normalized) return this.getAll();
    return (await this.loadData()).filter((seed) => {
      return seed.name.toLowerCase().includes(normalized)
        || seed.slug.includes(normalized)
        || seed.rarity.toLowerCase().includes(normalized)
        || String(seed.obtainMethod).toLowerCase().includes(normalized)
        || String(seed.packName || '').toLowerCase().includes(normalized);
    });
  }

  filter(items, filters) {
    return items.filter((seed) => {
      if (filters.rarity && filters.rarity !== 'all' && seed.rarity.toLowerCase() !== filters.rarity.toLowerCase()) return false;
      if (filters.obtainMethod && filters.obtainMethod !== 'all' && seed.obtainMethod.toLowerCase() !== filters.obtainMethod.toLowerCase()) return false;
      if (filters.available === true && !seed.obtainable) return false;
      if (filters.available === false && seed.obtainable) return false;
      return true;
    });
  }

  sort(items, order) {
    const sorted = [...items];
    const rarityOrder = {
      common: 1,
      uncommon: 2,
      rare: 3,
      epic: 4,
      legendary: 5,
      mythic: 6,
      super: 7
    };

    sorted.sort((a, b) => {
      if (order === 'name') {
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      }
      if (order === 'price-asc') {
        const priceA = a.purchasePrice ?? a.priceMin ?? Number.POSITIVE_INFINITY;
        const priceB = b.purchasePrice ?? b.priceMin ?? Number.POSITIVE_INFINITY;
        return priceA - priceB;
      }
      if (order === 'price-desc') {
        const priceA = a.purchasePrice ?? a.priceMax ?? Number.NEGATIVE_INFINITY;
        const priceB = b.purchasePrice ?? b.priceMax ?? Number.NEGATIVE_INFINITY;
        return priceB - priceA;
      }
      if (order === 'rarity') {
        const rankA = rarityOrder[a.rarity.toLowerCase()] ?? 999;
        const rankB = rarityOrder[b.rarity.toLowerCase()] ?? 999;
        return rankA - rankB || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      }
      if (order === 'stockChance-desc') {
        return (b.stockChance ?? -1) - (a.stockChance ?? -1);
      }
      if (order === 'stockChance-asc') {
        return (a.stockChance ?? Number.POSITIVE_INFINITY) - (b.stockChance ?? Number.POSITIVE_INFINITY);
      }
      return 0;
    });

    return sorted;
  }
}
