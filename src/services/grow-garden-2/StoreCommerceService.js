import { STORE_COMMERCE_CONFIG } from '../../config/store-commerce-config.js';
import { CouponAdminService } from '../CouponAdminService.js';

const DATA_URL = '/src/data/grow-garden-2/store-products.json';
const COUPONS_URL = '/src/data/grow-garden-2/store-coupons.example.json';
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export const STORE_STATUSES = Object.freeze({
  order: ['draft', 'awaiting_payment', 'paid', 'preparing_delivery', 'ready_for_delivery', 'delivered', 'cancelled', 'refunded', 'disputed'],
  payment: ['pending', 'confirmed', 'expired', 'cancelled', 'refunded', 'failed', 'amount_mismatch', 'disputed'],
  delivery: ['pending', 'contacting_customer', 'scheduled', 'delivering', 'delivered', 'failed', 'cancelled']
});

export const normalizeRobloxUsername = (username) => String(username || '').trim();

export const validateRobloxUsername = (username) => {
  const normalized = normalizeRobloxUsername(username);
  if (!normalized) return { ok: false, value: normalized, reason: 'Informe o nome de usuario do Roblox.' };
  if (/https?:\/\//i.test(normalized) || /roblox\.com/i.test(normalized)) {
    return { ok: false, value: normalized, reason: 'Informe apenas o username, nao um link.' };
  }
  if (/senha|password|cookie|token|2fa|codigo|c[oó]digo/i.test(normalized)) {
    return { ok: false, value: normalized, reason: 'Nunca informe senha, cookie ou codigo de acesso.' };
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return { ok: false, value: normalized, reason: 'Use 3 a 20 caracteres: letras, numeros e underline.' };
  }
  return { ok: true, value: normalized, reason: null };
};

export const formatMoney = (amountInCents, currency = 'BRL') => {
  if (!Number.isInteger(amountInCents)) return 'Preco a definir';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amountInCents / 100);
};

export const toPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export const calculateSubtotalInCents = (unitPriceInCents, quantity) => {
  if (!Number.isInteger(unitPriceInCents) || unitPriceInCents < 0) throw new Error('Preco invalido.');
  const safeQuantity = toPositiveInteger(quantity);
  if (!safeQuantity) throw new Error('Quantidade invalida.');
  return unitPriceInCents * safeQuantity;
};

const getProductCategory = (seed) => seed?.commerce?.category || seed?.category || 'produto';
const isProductOutOfStock = (product) => ['sold_out', 'out_of_stock'].includes(String(product?.stockStatus || '').toLowerCase())
  || (Number.isInteger(product?.availableStock) && product.availableStock <= 0);

const validateOrderItem = ({ seed, quantity, canCreateManualPixOrder }) => {
  const errors = [];
  if (!seed?.slug) errors.push(orderError('PRODUCT_NOT_FOUND'));
  const product = seed?.commerce || seed;
  const canCreate = canCreateManualPixOrder(product);
  if (!canCreate.ok) errors.push(orderError(canCreate.code || 'SALE_DISABLED', canCreate.message || canCreate.reason));
  if (!Number.isInteger(product?.priceInCents) || product.priceInCents <= 0) errors.push(orderError('INVALID_PRODUCT_PRICE'));
  const safeQuantity = toPositiveInteger(quantity);
  if (!safeQuantity) errors.push(orderError('INVALID_QUANTITY'));
  if (safeQuantity && canCreate.ok && isProductOutOfStock(product)) {
    errors.push(orderError('OUT_OF_STOCK', 'Produto temporariamente sem estoque.'));
  } else if (safeQuantity && canCreate.ok && Number.isInteger(product?.availableStock) && safeQuantity > product.availableStock) {
    errors.push(orderError('OUT_OF_STOCK', `${seed?.name || 'Produto'} nao possui estoque suficiente.`));
  }
  if (safeQuantity && Number.isInteger(product?.maxPerOrder) && safeQuantity > product.maxPerOrder) {
    errors.push(orderError('INVALID_QUANTITY', `${seed?.name || 'Produto'} excede o limite por pedido.`));
  }
  if (errors.length > 0) return { ok: false, errors };
  const subtotalInCents = calculateSubtotalInCents(product.priceInCents, safeQuantity);
  return {
    ok: true,
    item: {
      productSlug: seed.slug,
      seedSlug: seed.slug,
      productName: seed.name,
      seedName: seed.name,
      category: getProductCategory(seed),
      packageQuantity: product.packageQuantity || seed.packageQuantity || 1,
      image: seed.image || product.image || '',
      quantity: safeQuantity,
      unitPriceInCents: product.priceInCents,
      subtotalInCents
    }
  };
};

export const normalizeCouponCode = (code) => String(code || '').trim().toUpperCase();

const CATEGORY_ALIASES = Object.freeze({
  seed: 'seeds',
  seeds: 'seeds',
  semente: 'seeds',
  sementes: 'seeds',
  pet: 'pets',
  pets: 'pets',
  gear: 'gears',
  gears: 'gears',
  equipamento: 'gears',
  equipamentos: 'gears',
  pacote: 'packages',
  pacotes: 'packages',
  package: 'packages',
  packages: 'packages'
});

export const normalizeCouponCategory = (category) => {
  const key = String(category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-');
  return CATEGORY_ALIASES[key] || key;
};

export const normalizeCouponProductSlug = (productSlug) => String(productSlug || '').trim().toLowerCase();

const uniqueList = (items) => [...new Set(items.filter(Boolean))];

const getCouponCategories = (coupon) => uniqueList([
  ...(Array.isArray(coupon?.applicableCategories) ? coupon.applicableCategories : []),
  ...(Array.isArray(coupon?.appliesTo?.categories) ? coupon.appliesTo.categories : []),
  ...(Array.isArray(coupon?.categories) ? coupon.categories : String(coupon?.categories || '').split(','))
].map(normalizeCouponCategory));

const getCouponProductSlugs = (coupon) => uniqueList([
  ...(Array.isArray(coupon?.applicableProductSlugs) ? coupon.applicableProductSlugs : []),
  ...(Array.isArray(coupon?.appliesTo?.productSlugs) ? coupon.appliesTo.productSlugs : []),
  ...(Array.isArray(coupon?.productSlugs) ? coupon.productSlugs : String(coupon?.productSlugs || '').split(','))
].map(normalizeCouponProductSlug));

const getCouponDiscountType = (coupon) => {
  const type = String(coupon?.discountType || coupon?.type || '').trim().toLowerCase();
  if (['percent', 'percentage'].includes(type)) return 'percentage';
  if (type === 'fixed') return 'fixed';
  return type;
};

const getCouponDiscountValue = (coupon, discountType) => {
  const rawValue = discountType === 'fixed'
    ? (coupon?.discountValue ?? coupon?.amountInCents ?? coupon?.value)
    : (coupon?.discountValue ?? coupon?.value);
  const value = Number(rawValue);
  return Number.isInteger(value) ? value : null;
};

const normalizeCouponLine = (line) => ({
  productSlug: normalizeCouponProductSlug(line?.productSlug || line?.seedSlug || line?.slug),
  productCategory: normalizeCouponCategory(line?.productCategory || line?.category),
  subtotalInCents: Number.isInteger(line?.subtotalInCents) && line.subtotalInCents >= 0 ? line.subtotalInCents : null
});

const couponDateTime = (value, endOfDay = false) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
    : new Date(text);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
};

const buildCouponLines = ({ productLines = [], productSlugs = [], productCategories = [], subtotalInCents }) => {
  if (Array.isArray(productLines) && productLines.length > 0) {
    return productLines.map(normalizeCouponLine).filter((line) => line.productSlug || line.productCategory);
  }
  const slugs = productSlugs.map(normalizeCouponProductSlug);
  const categories = productCategories.map(normalizeCouponCategory);
  const count = Math.max(slugs.length, categories.length, 1);
  return Array.from({ length: count }, (_, index) => ({
    productSlug: slugs[index] || '',
    productCategory: categories[index] || '',
    subtotalInCents: count === 1 ? subtotalInCents : null
  }));
};

export const calculateCouponDiscountInCents = ({
  coupon,
  subtotalInCents,
  productSlugs = [],
  productCategories = [],
  productLines = [],
  usageCount = 0,
  now = new Date()
}) => {
  if (!coupon || coupon.active !== true) return { ok: false, discountInCents: 0, reason: 'Cupom inativo ou inexistente.' };
  if (!Number.isInteger(subtotalInCents) || subtotalInCents < 0) return { ok: false, discountInCents: 0, reason: 'Subtotal invalido.' };
  if (Number.isInteger(coupon.minimumOrderInCents) && subtotalInCents < coupon.minimumOrderInCents) {
    return { ok: false, discountInCents: 0, reason: 'Pedido minimo nao atingido.' };
  }
  const currentTime = now.getTime();
  const startsAt = couponDateTime(coupon.startsAt, false);
  const expiresAt = couponDateTime(coupon.expiresAt, true);
  if (startsAt && currentTime < startsAt) return { ok: false, discountInCents: 0, reason: 'Cupom ainda nao iniciou.' };
  if (expiresAt && currentTime > expiresAt) return { ok: false, discountInCents: 0, reason: 'Cupom expirado.' };
  const usageLimit = Number.isInteger(coupon.totalUsageLimit) ? coupon.totalUsageLimit : coupon.maxUses;
  if (Number.isInteger(usageLimit) && usageCount >= usageLimit) {
    return { ok: false, discountInCents: 0, reason: 'Limite de uso atingido.' };
  }
  const allowedSlugs = new Set(getCouponProductSlugs(coupon));
  const allowedCategories = new Set(getCouponCategories(coupon));
  const hasProductRestriction = allowedSlugs.size > 0;
  const hasCategoryRestriction = allowedCategories.size > 0;
  const lines = buildCouponLines({ productLines, productSlugs, productCategories, subtotalInCents });
  const eligibleLines = hasProductRestriction || hasCategoryRestriction
    ? lines.filter((line) => allowedSlugs.has(line.productSlug) || allowedCategories.has(line.productCategory))
    : lines;
  if (eligibleLines.length === 0) {
    return { ok: false, discountInCents: 0, reason: 'Cupom nao aplicavel aos produtos do carrinho.' };
  }
  const eligibleSubtotalInCents = eligibleLines.every((line) => Number.isInteger(line.subtotalInCents))
    ? eligibleLines.reduce((total, line) => total + line.subtotalInCents, 0)
    : subtotalInCents;
  if (eligibleSubtotalInCents <= 0) return { ok: false, discountInCents: 0, reason: 'Subtotal elegivel invalido.' };

  const discountType = getCouponDiscountType(coupon);
  const discountValue = getCouponDiscountValue(coupon, discountType);
  let discountInCents = 0;
  if (discountType === 'percentage') {
    if (!Number.isInteger(discountValue) || discountValue <= 0 || discountValue > 100) return { ok: false, discountInCents: 0, reason: 'Percentual invalido.' };
    discountInCents = Math.floor((eligibleSubtotalInCents * discountValue) / 100);
  } else if (discountType === 'fixed') {
    if (!Number.isInteger(discountValue) || discountValue <= 0) return { ok: false, discountInCents: 0, reason: 'Valor de desconto invalido.' };
    discountInCents = discountValue;
  } else {
    return { ok: false, discountInCents: 0, reason: 'Tipo de cupom invalido.' };
  }
  if (Number.isInteger(coupon.maximumDiscountInCents)) {
    discountInCents = Math.min(discountInCents, coupon.maximumDiscountInCents);
  }
  discountInCents = Math.min(discountInCents, eligibleSubtotalInCents, subtotalInCents);
  return { ok: true, discountInCents, reason: null, eligibleSubtotalInCents };
};

const emvField = (id, value) => {
  const stringValue = String(value ?? '');
  return `${id}${String(stringValue.length).padStart(2, '0')}${stringValue}`;
};

const normalizePixText = (value, maxLength) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9 .-]/g, '')
  .trim()
  .slice(0, maxLength);

export const calculatePixCrc = (payloadWithoutCrcValue) => {
  let crc = 0xffff;
  for (const char of String(payloadWithoutCrcValue)) {
    crc ^= char.charCodeAt(0) << 8;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

export const validatePixPayloadCrc = (payload) => {
  const value = String(payload || '');
  if (!/^000201/.test(value) || !/6304[0-9A-F]{4}$/i.test(value)) return false;
  const body = value.slice(0, -4);
  return calculatePixCrc(body) === value.slice(-4).toUpperCase();
};

export const buildPixPayload = ({
  pixKey,
  amountInCents,
  txid,
  receiverName,
  receiverCity,
  description = ''
}) => {
  const key = String(pixKey || '').trim();
  const name = normalizePixText(receiverName, 25);
  const city = normalizePixText(receiverCity, 15);
  const safeTxid = normalizePixText(txid, 25).replace(/\s/g, '') || 'THURBLOX';
  if (!key) return { ok: false, reason: 'PIX_KEY ausente.' };
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) return { ok: false, reason: 'Valor Pix invalido.' };
  if (!name || !city) return { ok: false, reason: 'PIX_RECEIVER_NAME e PIX_RECEIVER_CITY sao necessarios para gerar BR Code Pix valido.' };

  const merchantAccount = emvField('00', 'br.gov.bcb.pix')
    + emvField('01', key)
    + (description ? emvField('02', normalizePixText(description, 72)) : '');
  const additionalData = emvField('05', safeTxid);
  const amount = (amountInCents / 100).toFixed(2);
  const payloadWithoutCrc = [
    emvField('00', '01'),
    emvField('01', '12'),
    emvField('26', merchantAccount),
    emvField('52', '0000'),
    emvField('53', '986'),
    emvField('54', amount),
    emvField('58', 'BR'),
    emvField('59', name),
    emvField('60', city),
    emvField('62', additionalData),
    '6304'
  ].join('');

  return {
    ok: true,
    payload: `${payloadWithoutCrc}${calculatePixCrc(payloadWithoutCrc)}`,
    txid: safeTxid,
    amount,
    receiverName: name,
    receiverCity: city
  };
};

const ORDER_ERROR_MESSAGES = Object.freeze({
  PRODUCT_NOT_FOUND: 'Produto nao encontrado.',
  SALE_DISABLED: 'Este produto ainda nao esta disponivel para venda.',
  INVALID_PRODUCT_PRICE: 'O preco deste produto ainda nao foi configurado.',
  OUT_OF_STOCK: 'Produto sem estoque.',
  INVALID_QUANTITY: 'Quantidade invalida.',
  INVALID_ROBLOX_USERNAME: 'Confira o nick do Roblox.',
  CUSTOMER_NAME_REQUIRED: 'Informe o nome do cliente.',
  TERMS_NOT_ACCEPTED: 'Aceite os termos para continuar.',
  COMMERCE_DISABLED: 'A loja esta em modo de teste.',
  INVALID_COUPON: 'Cupom invalido ou expirado.'
});

const orderError = (code, message = ORDER_ERROR_MESSAGES[code]) => ({ code, message });

export const createOrderCode = ({ prefix = 'THUR', now = new Date(), random = Math.random } = {}) => {
  const timePart = now.getTime().toString(36).toUpperCase().slice(-3);
  const randomPart = Math.floor(random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  return `${prefix}-${timePart}${randomPart}`;
};

export class StoreCommerceService {
  constructor({ config = STORE_COMMERCE_CONFIG } = {}) {
    this.config = config;
    this.cache = null;
    this.couponsCache = null;
    this.couponAdminService = new CouponAdminService();
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

  async loadProducts() {
    if (this.cache) return this.cache;
    this.cache = await this.fetchJson(DATA_URL);
    return this.cache;
  }

  async loadCoupons() {
    if (this.couponsCache) return this.mergeAdminCoupons(this.couponsCache);
    const data = await this.fetchJson(COUPONS_URL);
    this.couponsCache = Array.isArray(data.coupons) ? data.coupons : [];
    return this.mergeAdminCoupons(this.couponsCache);
  }

  mergeAdminCoupons(baseCoupons) {
    const byCode = new Map((baseCoupons || []).map((coupon) => [normalizeCouponCode(coupon.code), coupon]));
    this.couponAdminService.list().forEach((coupon) => {
      byCode.set(normalizeCouponCode(coupon.code), coupon);
    });
    return Array.from(byCode.values());
  }

  normalizeStoreProduct(product) {
    const priceInCents = Number.isInteger(product.priceInCents)
      ? product.priceInCents
      : product.salePriceInCents;
    const availableStock = Number.isInteger(product.availableStock)
      ? Math.max(0, product.availableStock)
      : null;
    const stockStatus = product.stockStatus || (availableStock === 0 ? 'out_of_stock' : 'available');
    const soldOut = ['sold_out', 'out_of_stock'].includes(String(stockStatus).toLowerCase());
    return {
      ...product,
      game: product.game || 'grow-garden-2',
      slug: product.slug,
      seedSlug: product.slug,
      imageUrl: product.image,
      priceInCents: Number.isInteger(priceInCents) ? priceInCents : null,
      salePriceInCents: Number.isInteger(product.salePriceInCents) ? product.salePriceInCents : priceInCents,
      originalPriceInCents: Number.isInteger(product.originalPriceInCents) ? product.originalPriceInCents : null,
      discountPercent: Number.isInteger(product.discountPercent) ? product.discountPercent : null,
      availableStock,
      stockStatus,
      saleEnabled: product.saleEnabled === true && !soldOut,
      currency: product.currency || 'BRL',
      deliveryType: product.deliveryType || 'manual_in_game',
      maxPerOrder: Number.isInteger(product.maxPerOrder) ? Math.max(1, product.maxPerOrder) : null
    };
  }

  async getStoreCatalog() {
    const data = await this.loadProducts();
    return (data.products || []).map((product) => {
      const commerce = this.normalizeStoreProduct(product);
      return {
        ...product,
        slug: product.slug,
        name: product.name,
        image: product.image,
        commerce
      };
    });
  }

  defaultProduct(seed, defaults) {
    return {
      game: 'grow-garden-2',
      seedSlug: seed.slug,
      name: seed.name,
      imageUrl: seed.image || null,
      gamePrice: Number.isFinite(seed.purchasePrice) ? seed.purchasePrice : null,
      gameCurrency: seed.currency || 'Sheckles',
      saleEnabled: defaults.defaultSaleEnabled === true,
      priceInCents: defaults.defaultPriceInCents,
      currency: defaults.currency || 'BRL',
      availableStock: defaults.defaultAvailableStock || 0,
      reservedStock: defaults.defaultReservedStock || 0,
      deliveryType: defaults.deliveryType || 'manual_in_game',
      estimatedDeliveryMinutes: null,
      maxPerOrder: defaults.defaultMaxPerOrder,
      updatedAt: null
    };
  }

  mergeProduct(seed, product, defaults) {
    const merged = { ...this.defaultProduct(seed, defaults), ...product };
    merged.priceInCents = Number.isInteger(merged.priceInCents) ? merged.priceInCents : null;
    merged.availableStock = Number.isInteger(merged.availableStock) ? Math.max(0, merged.availableStock) : 0;
    merged.reservedStock = Number.isInteger(merged.reservedStock) ? Math.max(0, merged.reservedStock) : 0;
    merged.saleEnabled = merged.saleEnabled === true;
    merged.maxPerOrder = Number.isInteger(merged.maxPerOrder) ? Math.max(1, merged.maxPerOrder) : null;
    return merged;
  }

  async getCatalog(seeds) {
    const data = await this.loadProducts();
    const productsBySlug = new Map((data.products || [])
      .filter((product) => product.seedSlug)
      .map((product) => [product.seedSlug, product]));
    return seeds.map((seed) => {
      const product = this.mergeProduct(seed, productsBySlug.get(seed.slug), data);
      return { ...seed, commerce: product };
    });
  }

  canBuy(product) {
    if (this.config.commerceEnabled !== true) return { ok: false, reason: 'Checkout temporariamente indisponivel.' };
    if (!product?.saleEnabled) return { ok: false, reason: 'Venda ainda nao disponivel.' };
    if (!Number.isInteger(product.priceInCents)) return { ok: false, reason: 'Preco em reais ainda nao definido.' };
    if (!Number.isInteger(product.availableStock) || product.availableStock <= 0) return { ok: false, reason: 'Estoque indisponivel.' };
    return { ok: true, reason: null };
  }

  canCreateManualPixOrder(product) {
    if (isProductOutOfStock(product)) return { ok: false, ...orderError('OUT_OF_STOCK', 'Produto temporariamente sem estoque.') };
    if (!product?.saleEnabled && product?.testSaleEnabled !== true) return { ok: false, ...orderError('SALE_DISABLED') };
    if (!Number.isInteger(product?.priceInCents) || product.priceInCents <= 0) return { ok: false, ...orderError('INVALID_PRODUCT_PRICE') };
    if (Number.isInteger(product.availableStock) && product.availableStock <= 0) return { ok: false, ...orderError('OUT_OF_STOCK') };
    if (this.config.pix?.mode === 'manual') {
      if (this.config.commerceEnabled !== true && this.config.testCheckoutEnabled !== true) {
        return { ok: false, ...orderError('COMMERCE_DISABLED') };
      }
      return { ok: true, reason: null };
    }
    return this.canBuy(product);
  }

  validateCouponForOrder({ couponCode, coupons = [], subtotalInCents, productSlugs = [], productCategories = [], productLines = [] }) {
    const normalizedCode = normalizeCouponCode(couponCode);
    if (!normalizedCode) {
      return { ok: true, couponCode: null, discountInCents: 0, message: null };
    }
    const coupon = coupons.find((item) => normalizeCouponCode(item.code) === normalizedCode);
    const result = calculateCouponDiscountInCents({
      coupon,
      subtotalInCents,
      productSlugs,
      productCategories,
      productLines,
      usageCount: Number(coupon?.usedCount || 0)
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason, couponCode: normalizedCode, discountInCents: 0 };
    }
    return {
      ok: true,
      couponCode: normalizedCode,
      discountInCents: result.discountInCents,
      message: `Cupom ${normalizedCode} aplicado.`
    };
  }

  buildCartPixOrder({
    items = [],
    customerName,
    customerUserId = null,
    robloxUsername,
    robloxDisplayName,
    email,
    couponCode,
    coupons = [],
    termsAccepted,
    now = new Date()
  }) {
    const errors = [];
    if (!Array.isArray(items) || items.length === 0) errors.push(orderError('INVALID_QUANTITY', 'Adicione pelo menos um produto ao carrinho.'));
    if (!String(customerName || '').trim()) errors.push(orderError('CUSTOMER_NAME_REQUIRED'));
    const username = validateRobloxUsername(robloxUsername);
    if (!username.ok) errors.push(orderError('INVALID_ROBLOX_USERNAME', username.reason));
    if (termsAccepted !== true) errors.push(orderError('TERMS_NOT_ACCEPTED'));

    const orderItems = [];
    const productSlugs = [];
    const productCategories = [];
    if (Array.isArray(items)) {
      items.forEach(({ seed, quantity }) => {
        const validated = validateOrderItem({
          seed,
          quantity,
          canCreateManualPixOrder: (product) => this.canCreateManualPixOrder(product)
        });
        if (!validated.ok) {
          errors.push(...validated.errors);
          return;
        }
        orderItems.push(validated.item);
      productSlugs.push(validated.item.productSlug);
      productCategories.push(validated.item.category);
      });
    }
    if (errors.length > 0) return { ok: false, code: errors[0].code, errors: errors.map((error) => error.message) };

    const subtotalInCents = orderItems.reduce((total, item) => total + item.subtotalInCents, 0);
    const coupon = this.validateCouponForOrder({
      couponCode,
      coupons,
      subtotalInCents,
      productSlugs,
      productCategories,
      productLines: orderItems.map((item) => ({
        productSlug: item.productSlug,
        productCategory: item.category,
        subtotalInCents: item.subtotalInCents
      }))
    });
    if (!coupon.ok) return { ok: false, code: 'INVALID_COUPON', errors: [coupon.reason || 'Cupom invalido ou expirado.'] };

    const discountInCents = coupon.discountInCents;
    const totalInCents = Math.max(0, subtotalInCents - discountInCents);
    const pixConfig = this.config.pix || {};
    const orderCode = createOrderCode({ now });
    const pixPayload = buildPixPayload({
      pixKey: pixConfig.key,
      amountInCents: totalInCents,
      txid: orderCode.replace(/[^A-Z0-9]/gi, ''),
      receiverName: pixConfig.receiverName,
      receiverCity: pixConfig.receiverCity,
      description: orderCode
    });
    const firstItem = orderItems[0];

    return {
      ok: true,
      order: {
        orderCode,
        items: orderItems,
        seedSlug: firstItem.productSlug,
        productSlug: firstItem.productSlug,
        seedName: firstItem.productName,
        productName: orderItems.length === 1 ? firstItem.productName : `${orderItems.length} produtos`,
        quantity: orderItems.reduce((total, item) => total + item.quantity, 0),
        unitPriceInCents: firstItem.unitPriceInCents,
        subtotalInCents,
        couponCode: coupon.couponCode,
        discountInCents,
        totalInCents,
        customerName: String(customerName).trim(),
        customerUserId: customerUserId ? String(customerUserId).trim() : null,
        customerEmail: String(email || '').trim(),
        robloxUsername: username.value,
        robloxDisplayName: String(robloxDisplayName || '').trim(),
        email: String(email || '').trim(),
        paymentMethod: 'pix',
        pixMode: pixConfig.mode || 'manual',
        pixPayload: pixPayload.ok ? pixPayload.payload : null,
        pixPayloadStatus: pixPayload.ok ? 'ready' : 'configuration_required',
        pixPayloadError: pixPayload.ok ? null : pixPayload.reason,
        pixTxid: pixPayload.ok ? pixPayload.txid : null,
        pixQrImageUrl: pixPayload.ok ? `/api/orders/${encodeURIComponent(orderCode)}/pix-qr.svg` : null,
        paymentStatus: 'pending',
        orderStatus: 'awaiting_payment',
        deliveryStatus: 'pending',
        acceptedTerms: true,
        customerReportedPayment: false,
        customerReportedPaymentAt: null,
        createdAt: now.toISOString()
      }
    };
  }

  buildManualPixOrder({
    seed,
    quantity,
    customerName,
    customerUserId,
    robloxUsername,
    robloxDisplayName,
    email,
    couponCode,
    coupons = [],
    termsAccepted,
    now = new Date()
  }) {
    return this.buildCartPixOrder({
      items: [{ seed, quantity }],
      customerName,
      customerUserId,
      robloxUsername,
      robloxDisplayName,
      email,
      couponCode,
      coupons,
      termsAccepted,
      now
    });
  }

  buildOrderPayload({ seed, quantity, customerName, robloxUsername, robloxDisplayName, email, couponCode, termsAccepted }) {
    const safeQuantity = toPositiveInteger(quantity);
    const username = validateRobloxUsername(robloxUsername);
    const errors = [];
    if (!safeQuantity) errors.push('Quantidade invalida.');
    if (!String(customerName || '').trim()) errors.push('Informe o nome do cliente.');
    if (!username.ok) errors.push(username.reason);
    if (termsAccepted !== true) errors.push('Aceite os termos antes de gerar o Pix.');
    if (errors.length > 0) return { ok: false, errors };

    return {
      ok: true,
      payload: {
        items: [{ seedSlug: seed.slug, quantity: safeQuantity }],
        customerName: String(customerName).trim(),
        robloxUsername: username.value,
        robloxDisplayName: String(robloxDisplayName || '').trim(),
        email: String(email || '').trim(),
        couponCode: normalizeCouponCode(couponCode)
      }
    };
  }
}
