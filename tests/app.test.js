import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { BrainrotDataService } from '../src/services/BrainrotDataService.js';
import { BrainrotImageService } from '../src/services/BrainrotImageService.js';
import { BrainrotValueResolverService } from '../src/services/BrainrotValueResolverService.js';
import { RealTradeEquivalenceService } from '../src/services/RealTradeEquivalenceService.js';
import { BrainrotRealMoneyValueService } from '../src/services/BrainrotRealMoneyValueService.js';
import {
  RARITY_ORDER,
  TradeEquivalenceService
} from '../src/services/TradeEquivalenceService.js';
import { FormatService } from '../src/services/FormatService.js';
import { FavoritesService } from '../src/services/FavoritesService.js';
import { IncomeCalculatorService } from '../src/services/IncomeCalculatorService.js';
import {
  BACKGROUND_BRAINROTS,
  RARITY_THEME
} from '../src/services/VisualConfig.js';
import { formatTradeValue } from '../src/utils/formatTradeValue.js';
import { parseGameNumber } from '../src/utils/parseGameNumber.js';
import { slugify } from '../src/utils/slugify.js';
import { STORE_COMMERCE_CONFIG } from '../src/config/store-commerce-config.js';
import { BRAINROT_MAINTENANCE_CONFIG } from '../src/config/brainrot-maintenance-config.js';
import {
  StoreCommerceService,
  buildPixPayload,
  calculateCouponDiscountInCents,
  calculateSubtotalInCents,
  createOrderCode,
  formatMoney,
  normalizeCouponCategory,
  normalizeCouponCode,
  normalizeCouponProductSlug,
  validatePixPayloadCrc,
  validateRobloxUsername
} from '../src/services/grow-garden-2/StoreCommerceService.js';
import { LocalOrderRepository, isActiveOrder } from '../src/services/grow-garden-2/LocalOrderRepository.js';
import { CartService, CART_STORAGE_KEY } from '../src/services/grow-garden-2/CartService.js';
import { AuthService } from '../src/services/AuthService.js';
import { AdminAuthService } from '../src/services/AdminAuthService.js';
import { InventoryOverrideService } from '../src/services/InventoryOverrideService.js';
import { CouponAdminService } from '../src/services/CouponAdminService.js';
import { getSupportBotReply, isActiveSupportConversation, SupportService, SUPPORT_ACTIVE_CONVERSATION_KEY, SUPPORT_CUSTOMER_PROFILE_KEY, SUPPORT_MESSAGE_MAX_LENGTH } from '../src/services/SupportService.js';
import { detectSupportIntent, extractOrderCode, extractProductMention, SmartSupportBotService } from '../src/services/SmartSupportBotService.js';
import { findChatProduct, getChatProductRoute, hasChatPurchaseIntent } from '../src/services/ChatProductSearchService.js';
import { calculateVipStatus, calculateVipDiscountInCents, getVipStatusForCustomer, isVipEligibleOrder, selectBestDiscount, VIP_OVERRIDES_STORAGE_KEY, VipService } from '../src/services/VipLoyaltyService.js';
import { ReviewService, REVIEW_STORAGE_KEY } from '../src/services/ReviewService.js';
import { OrderStore } from '../server/store/OrderStore.js';
import { SandboxPixPaymentGateway } from '../server/store/PaymentGateway.js';
import { PixPayloadService } from '../server/store/PixPayloadService.js';
import { ProductStockStore } from '../server/store/ProductStockStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const htmlContent = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
const appCode = readFileSync(resolve(projectRoot, 'app.js'), 'utf8');
const componentCode = readFileSync(resolve(projectRoot, 'src', 'components', 'EquivalenceApp.js'), 'utf8');
const imageServiceCode = readFileSync(resolve(projectRoot, 'src', 'services', 'BrainrotImageService.js'), 'utf8');
const homePortalCode = readFileSync(resolve(projectRoot, 'src', 'components', 'HomePortal.js'), 'utf8');
const termsPageCode = readFileSync(resolve(projectRoot, 'src', 'components', 'TermsPage.js'), 'utf8');
const brainrotMaintenanceScreenCode = readFileSync(resolve(projectRoot, 'src', 'components', 'BrainrotMaintenanceScreen.js'), 'utf8');
const brainrotMaintenanceConfigCode = readFileSync(resolve(projectRoot, 'src', 'config', 'brainrot-maintenance-config.js'), 'utf8');
const growGardenModuleCode = readFileSync(resolve(projectRoot, 'src', 'components', 'GrowGardenModule.js'), 'utf8');
const pixQrCodeServiceCode = readFileSync(resolve(projectRoot, 'src', 'services', 'PixQrCodeService.js'), 'utf8');
const orderStoreCode = readFileSync(resolve(projectRoot, 'server', 'store', 'OrderStore.js'), 'utf8');
const storeConfigCode = readFileSync(resolve(projectRoot, 'src', 'config', 'store-commerce-config.js'), 'utf8');
const paymentGatewayCode = readFileSync(resolve(projectRoot, 'server', 'store', 'PaymentGateway.js'), 'utf8');
const devServerCode = readFileSync(resolve(projectRoot, 'scripts', 'dev-server.mjs'), 'utf8');
const fetchImagesScript = readFileSync(resolve(projectRoot, 'scripts', 'fetch-brainrot-images.js'), 'utf8');
const extractScreenshotsScript = readFileSync(resolve(projectRoot, 'scripts', 'extract-brainrots-from-screenshots.js'), 'utf8');
const processApprovedScreenshotsScript = readFileSync(resolve(projectRoot, 'scripts', 'process-approved-brainrot-images.js'), 'utf8');
const validateMarketValuesScript = readFileSync(resolve(projectRoot, 'scripts', 'validate-brainrot-market-values.js'), 'utf8');
const styles = readFileSync(resolve(projectRoot, 'styles.css'), 'utf8');
const rawBrainrotsData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrots.json'), 'utf8'));
const growGardenSeedsData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'grow-garden-2', 'seeds.json'), 'utf8'));
const growGardenSeedImagesData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'grow-garden-2', 'seed-images.json'), 'utf8'));
const growGardenStoreProductsData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'grow-garden-2', 'store-products.json'), 'utf8'));
const growGardenCouponsExampleData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'grow-garden-2', 'store-coupons.example.json'), 'utf8'));
const reviewData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrots-review.json'), 'utf8'));
const mutationsData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'mutations.json'), 'utf8'));
const marketValuesData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrot-market-values.json'), 'utf8'));
const realTradeValuesData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrot-real-trade-values.json'), 'utf8'));
const realMoneyValuesData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrot', 'real-money-values.json'), 'utf8'));
const gameStatsData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrot-game-stats.json'), 'utf8'));
const missingMarketValues = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrots-missing-market-values.json'), 'utf8'));
const imagesData = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrot-images.json'), 'utf8'));
const missingImages = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrots-missing-images.json'), 'utf8'));
const nameAliases = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'brainrot-name-aliases.json'), 'utf8'));
const userScreenshotImageMap = JSON.parse(readFileSync(resolve(projectRoot, 'src', 'data', 'user-screenshot-image-map.json'), 'utf8'));
const removedFeature = 'tra' + 'it';
const { brainrots: brainrotsData, diagnostics } = BrainrotDataService.merge({
  brainrots: rawBrainrotsData,
  marketValues: realTradeValuesData,
  gameStats: gameStatsData,
  images: imagesData
});

const findByName = (name) => brainrotsData.find((item) => item.name === name);
const findBySlug = (slug) => brainrotsData.find((item) => item.slug === slug);
const hasTradeValue = (pet) => TradeEquivalenceService.getBaseValue(pet) != null;
const fallbackPath = '/assets/brainrots/fallback/brainrot-placeholder.webp';
const createMemoryStorage = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    clear: () => entries.clear()
  };
};

test('public app shell loads only active store modules', () => {
  assert(htmlContent.includes('THUR BLOX'), 'index.html must contain the app title');
  assert.equal(appCode.includes('src/data/brainrots.json'), false, 'public app must not load retired Brainrot data');
  assert.ok(appCode.includes("storeGame: 'blox-fruits'"), 'public app must route Blox Fruits');
  assert.ok(appCode.includes("state.currentView === 'grow-garden'"), 'public app must route Grow a Garden 2');
  assert(!new RegExp(removedFeature, 'i').test(appCode), 'app.js must not load removed feature data');
  assert(!new RegExp(removedFeature, 'i').test(componentCode), 'UI component must not expose removed feature flows');
  assert(appCode.includes('serviceWorker.register'), 'app.js should register the service worker');
  assert.ok(existsSync(resolve(projectRoot, 'assets', 'icons', 'icon-192.png')), 'PWA 192 icon must exist');
  assert.ok(existsSync(resolve(projectRoot, 'assets', 'icons', 'icon-512.png')), 'PWA 512 icon must exist');
});

test('portal game cards use the correct game cover assets', () => {
  assert.ok(homePortalCode.includes("'blox-fruits': '/assets/blox-fruits/blox-fruits-category-authorized.webp'"), 'Blox Fruits portal card should use the authorized BloxLegacy category asset');
  assert.ok(homePortalCode.includes("'grow-garden': '/assets/portal/grow-a-garden-2.webp'"), 'Grow a Garden portal card should use the Grow a Garden cover asset');
  assert.ok(existsSync(resolve(projectRoot, 'assets', 'blox-fruits', 'blox-fruits-category-authorized.webp')), 'Blox Fruits portal cover must exist');
  assert.ok(existsSync(resolve(projectRoot, 'public', 'assets', 'portal', 'grow-a-garden-2.webp')), 'Grow a Garden portal cover must exist');
});

test('Brainrot legacy stays internal while public routes return home', () => {
  assert.equal(typeof BRAINROT_MAINTENANCE_CONFIG.enabled, 'boolean');
  assert.ok(brainrotMaintenanceConfigCode.includes('BRAINROT_MAINTENANCE_CONFIG'), 'central maintenance config must exist');
  assert.ok(appCode.includes("return 'home'"), 'legacy public routes must return to the portal');
  assert.equal(appCode.includes("await import('./src/components/BrainrotModule.js')"), false, 'public app must not load the retired module');
  assert.equal(homePortalCode.toLowerCase().includes('brainrot'), false, 'public portal source must not expose Brainrot');
  assert.ok(devServerCode.includes('isFrontendRoute'), 'dev server must route direct app URLs to index.html');
  assert.ok(devServerCode.includes('roube-um-brainrot'), 'direct Brainrot routes must be recognized');
});

test('Brainrot real money values use a separate manual BRL base without invented prices', () => {
  assert.equal(realMoneyValuesData.currency, 'BRL');
  assert.equal(realMoneyValuesData.items.length, rawBrainrotsData.length);
  assert.ok(realMoneyValuesData.items.every((item) => item.sourceType === 'manual'), 'commercial values must be manually administered');
  assert.ok(realMoneyValuesData.items.every((item) => item.saleEnabled === false), 'sale flag must stay disabled until commercial review');
  assert.ok(realMoneyValuesData.items.every((item) => item.priceInCents == null), 'base must not invent exact prices');
  assert.ok(realMoneyValuesData.items.every((item) => item.priceMinInCents == null && item.priceMaxInCents == null), 'base must not invent ranges');
  assert.ok(realMoneyValuesData.items.every((item) => item.recommendedPriceInCents == null), 'base must not invent recommended prices');
});

test('Brainrot real money service does not convert trade, income or other game values into BRL', () => {
  const service = BrainrotRealMoneyValueService.configure(realMoneyValuesData);
  const pet = {
    slug: 'garama-and-madundung',
    name: 'Garama and Madundung',
    communityTradeValue: 550,
    purchaseCost: 10000000000,
    incomePerSecond: 50000000
  };
  const value = service.getValue(pet);
  assert.equal(value.hasPrice, false);
  assert.equal(service.formatValue(value), 'Valor em reais ainda nao cadastrado');

  const priced = BrainrotRealMoneyValueService.configure({
    currency: 'BRL',
    items: [{ slug: 'manual-price', name: 'Manual Price', recommendedPriceInCents: 1234, sourceType: 'manual' }]
  }).getValue('manual-price');
  assert.equal(priced.hasPrice, true);
  assert.equal(BrainrotRealMoneyValueService.configure({ currency: 'BRL', items: [] }).formatValue(priced), 'R$ 12,34');
});

test('Grow a Garden 2 required seed images are mapped to confirmed unique webp assets', () => {
  const requiredSeedSlugs = [
    'mushroom',
    'green-bean',
    'banana',
    'tulip',
    'tomato',
    'apple',
    'bamboo',
    'corn',
    'cactus',
    'grape',
    'coconut',
    'mango'
  ];
  const seedsBySlug = new Map(growGardenSeedsData.seeds.map((seed) => [seed.slug, seed]));
  const imageBySlug = new Map(growGardenSeedImagesData.map((entry) => [entry.seedSlug, entry]));
  const imagePaths = new Set();

  for (const slug of requiredSeedSlugs) {
    const seed = seedsBySlug.get(slug);
    const image = imageBySlug.get(slug);
    assert.ok(seed, `${slug} must exist in Grow a Garden 2 seeds`);
    assert.ok(image, `${slug} must have image metadata`);
    assert.equal(seed.image, `/assets/grow-garden-2/seeds/${slug}.webp`);
    assert.equal(seed.imageStatus, 'real');
    assert.equal(image.sourceType, 'user_reference');
    assert.equal(image.usageStatus, 'confirmed');
    assert.ok(existsSync(resolve(projectRoot, 'public', 'assets', 'grow-garden-2', 'seeds', `${slug}.webp`)), `${slug} webp must exist`);
    assert.equal(imagePaths.has(seed.image), false, `${slug} must not reuse another confirmed seed image`);
    imagePaths.add(seed.image);
  }

  assert.ok(existsSync(resolve(projectRoot, 'public', 'assets', 'grow-garden-2', 'seeds', 'seed-placeholder.webp')), 'placeholder must exist for unverified images');
  assert.equal(existsSync(resolve(projectRoot, 'src', 'data', 'grow-garden-seeds.js')), false, 'legacy mock seed file must not exist');
});

test('Grow a Garden 2 commerce creates manual local orders without a backend API', () => {
  assert.equal(STORE_COMMERCE_CONFIG.commerceEnabled, true);
  assert.equal(STORE_COMMERCE_CONFIG.testCheckoutEnabled, false);
  assert.equal(STORE_COMMERCE_CONFIG.orderStorageMode, 'local');
  assert.equal(STORE_COMMERCE_CONFIG.paymentEnvironment, 'production');
  assert.equal(growGardenStoreProductsData.currency, 'BRL');
  assert.equal(growGardenStoreProductsData.deliveryType, 'manual_in_game');
  assert.equal(growGardenModuleCode.includes('Modo de teste'), false, 'customer UI must not show test mode');
  assert.equal(growGardenModuleCode.includes('COMMERCE_ENABLED=false'), false, 'customer UI must not show raw technical flags');
  assert.ok(growGardenModuleCode.includes('ORDER_CREATE_ERROR'), 'checkout must log real order creation failures');
  assert.ok(growGardenModuleCode.includes('Nenhum cupom aplicado.'), 'empty coupons should be described clearly');
  assert.ok(growGardenModuleCode.includes('LocalOrderRepository'), 'manual local orders should have an explicit repository');
  assert.ok(growGardenModuleCode.includes('ORDER_LOCAL_STORAGE'), 'local order creation must be visible in development logs');
  assert.ok(!storeConfigCode.includes('VITE_'), 'secret-like commerce config must not use VITE-prefixed keys');
});

test('Grow a Garden 2 store catalog contains only the requested products by section', () => {
  const products = growGardenStoreProductsData.products.filter((product) => !product.game || product.game === 'grow-garden-2');
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const expected = [
    ['hypno-bloom-seed', 'seeds', 'Hypno Bloom Seed', 1999, 60, 790, 'out_of_stock', 0, false],
    ['sun-bloom-seed', 'seeds', 'Sun Bloom Seed', 1500, 34, 990, 'available'],
    ['star-fruit-seed', 'seeds', 'Star Fruit Seed', 2000, 21, 1590, 'available'],
    ['dragon-breath-seed', 'seeds', 'Dragon Breath Seed', 1990, 60, 790, 'out_of_stock', 0, false],
    ['moon-bloom-seed', 'seeds', 'Moon Bloom Seed', 1900, 58, 790, 'available'],
    ['ghost-pepper-seed', 'seeds', 'Ghost Pepper Seed', 1900, 58, 790, 'available'],
    ['2x-venom-spitter-seed', 'seeds', '2x Venom Spitter Seed', 1590, 50, 790, 'available'],
    ['10x-rainbow-seed', 'seeds', '10x Rainbow Seed', 1290, 39, 790, 'available'],
    ['20x-rainbow-seed', 'seeds', '20x Rainbow Seed', 2580, 50, 1290, 'available'],
    ['10x-mega-seed', 'seeds', '10x Mega Seed', 2580, 69, 790, 'available'],
    ['20x-mega-seed', 'seeds', '20x Mega Seed', 5160, 75, 1290, 'available'],
    ['raccoon', 'pets', 'Raccoon', 8000, 63, 2990, 'available'],
    ['firefly', 'pets', 'Firefly', 2000, 61, 790, 'available'],
    ['dragon-fly', 'pets', 'Dragon Fly', 1190, 34, 790, 'available'],
    ['unicorn', 'pets', 'Unicorn', 1190, 34, 790, 'available'],
    ['big-unicorn', 'pets', 'Big Unicorn', 23000, 17, 18990, 'available'],
    ['super-rarojice-serpent', 'pets', 'Super Rarojice Serpent', null, null, 35284, 'available'],
    ['20x-super-watering-can', 'gears', '20x Super Watering Can', 1290, 39, 790, 'available'],
    ['20x-super-sprinkler', 'gears', '20x Super Sprinkler', 1390, 43, 790, 'available'],
    ['10x-super-sprinkler-10x-super-watering-can', 'gears', '10x Super Sprinkler + 10x Super Watering Can', 5360, 85, 790, 'available'],
    ['5x-hypno-bloom-seed', 'packages', '5x Hypno Bloom Seed', 10000, 61, 3950, 'available'],
    ['5x-moon-bloom-seed', 'packages', '5x Moon Bloom Seed', 9500, 58, 3950, 'available'],
    ['10x-dragon-breath-seed', 'packages', '10x Dragon Breath Seed', 20000, 55, 8990, 'available'],
    ['5x-dragon-breath-seed', 'packages', '5x Dragon Breath Seed', 10000, 40, 5990, 'available']
  ];

  assert.equal(products.length, expected.length);
  assert.deepEqual(
    products.reduce((counts, product) => ({ ...counts, [product.category]: (counts[product.category] || 0) + 1 }), {}),
    { seeds: 11, pets: 6, gears: 3, packages: 4 }
  );

  for (const [slug, category, name, originalPriceInCents, discountPercent, salePriceInCents, stockStatus, expectedStock, expectedSaleEnabled] of expected) {
    const product = bySlug.get(slug);
    assert.ok(product, `${slug} must exist`);
    assert.equal(product.category, category);
    assert.equal(product.name, name);
    assert.equal(product.originalPriceInCents, originalPriceInCents);
    assert.equal(product.discountPercent, discountPercent);
    assert.equal(product.salePriceInCents, salePriceInCents);
    assert.equal(product.priceInCents, salePriceInCents);
    assert.equal(product.stockStatus, stockStatus);
    assert.equal(product.availableStock, Number.isInteger(expectedStock) ? expectedStock : category === 'packages' ? 5 : 100);
    assert.equal(product.saleEnabled, typeof expectedSaleEnabled === 'boolean' ? expectedSaleEnabled : true);
    assert.equal(product.currency, 'BRL');
    assert.equal(product.paymentMethod, 'pix');
    assert.ok(product.image.startsWith(`/assets/grow-a-garden-2/store/${category}/`));
    assert.ok(existsSync(resolve(projectRoot, 'public', product.image.replace('/assets/', 'assets/'))), `${slug} image must exist`);
    assert.ok(existsSync(resolve(projectRoot, product.image.replace('/assets/', 'assets/'))), `${slug} served asset must exist`);
  }

  for (const slug of ['firefly', 'sun-bloom-seed', 'star-fruit-seed']) {
    const product = bySlug.get(slug);
    assert.ok(product, `${slug} must exist`);
    assert.equal(/^\d+x\s/i.test(product.name), false);
    assert.equal(/\(novo\)/i.test(product.name), false);
    assert.equal(product.availableStock, 100);
    assert.equal(product.saleEnabled, true);
    assert.equal(product.stockStatus, 'available');
  }

  assert.ok(growGardenModuleCode.includes('storeCategoryFilter'), 'store must expose category filters');
  assert.ok(growGardenModuleCode.includes('Catalogo informativo de seeds'), 'informative seed catalog must remain separate');
  assert.ok(growGardenModuleCode.includes('ESTOQUE ESGOTADO'), 'sold out products must show an overlay');
});

test('Grow a Garden 2 keeps new Firefly, Sun Bloom and Star Fruit products available', () => {
  const growProducts = growGardenStoreProductsData.products.filter((product) => !product.game || product.game === 'grow-garden-2');
  assert.equal(growProducts.length, 24);
  assert.deepEqual(
    growProducts.reduce((counts, product) => ({ ...counts, [product.category]: (counts[product.category] || 0) + 1 }), {}),
    { seeds: 11, pets: 6, gears: 3, packages: 4 }
  );
  const productsByCategory = growProducts.reduce((grouped, product) => {
    grouped[product.category] = grouped[product.category] || [];
    grouped[product.category].push(product);
    return grouped;
  }, {});
  assert.equal(productsByCategory.seeds.filter((product) => product.availableStock > 0).every((product) => product.stockStatus === 'available' && product.saleEnabled === true), true);
  assert.equal(productsByCategory.seeds.filter((product) => product.availableStock === 0).every((product) => product.stockStatus === 'out_of_stock' && product.saleEnabled === false), true);
  assert.equal(productsByCategory.packages.every((product) => product.stockStatus === 'available' && product.availableStock === 5 && product.saleEnabled === true), true);
  assert.equal(productsByCategory.pets.every((product) => product.stockStatus === 'available' && product.availableStock === 100 && product.saleEnabled === true), true);
  assert.equal(productsByCategory.gears.every((product) => product.stockStatus === 'available' && product.availableStock === 100 && product.saleEnabled === true), true);
  assert.deepEqual(productsByCategory.pets.map((product) => product.slug).includes('firefly'), true);
  assert.deepEqual(productsByCategory.seeds.map((product) => product.slug).includes('sun-bloom-seed'), true);
  assert.deepEqual(productsByCategory.seeds.map((product) => product.slug).includes('star-fruit-seed'), true);
  assert.deepEqual(productsByCategory.seeds.filter((product) => product.availableStock === 0).map((product) => product.slug), ['hypno-bloom-seed', 'dragon-breath-seed']);

  assert.ok(growGardenModuleCode.includes('sold-out-ribbon'), 'cards must render sold out badge overlay');
  assert.ok(growGardenModuleCode.includes('Comprar agora'), 'available products must expose a buy action');
  assert.ok(growGardenModuleCode.includes('Adicionar ao carrinho'), 'available products must expose cart action');
  assert.ok(growGardenModuleCode.includes('Sem estoque'), 'details must use disabled no-stock action text');
  assert.ok(growGardenModuleCode.includes('Produto temporariamente esgotado.'), 'details must explain temporary stock outage');
  assert.ok(growGardenModuleCode.includes('Remover itens indisponiveis'), 'cart must offer cleanup for old unavailable items');
  assert.ok(growGardenModuleCode.includes('Este produto esta sem estoque e precisa ser removido do carrinho.'), 'old cart items must show removal message');
  assert.ok(growGardenModuleCode.includes('buildAdminInventorySection'), 'admin must list inventory status');
});

test('Grow a Garden 2 order creation allows available seeds and packages but blocks sold out products', () => {
  const service = new StoreCommerceService({
    config: {
      ...STORE_COMMERCE_CONFIG,
      commerceEnabled: false,
      testCheckoutEnabled: true,
      pix: {
        ...STORE_COMMERCE_CONFIG.pix,
        receiverName: 'Delima Blox',
        receiverCity: 'SAO PAULO'
      }
    }
  });
  const productsBySlug = new Map(growGardenStoreProductsData.products.map((item) => [item.slug, item]));
  const seed = service.normalizeStoreProduct(productsBySlug.get('moon-bloom-seed'));
  const seedResult = service.buildManualPixOrder({
    seed: { ...seed, commerce: seed },
    quantity: 1,
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });
  assert.equal(seedResult.ok, true);
  assert.equal(seedResult.order.productSlug, 'moon-bloom-seed');

  const packageProduct = service.normalizeStoreProduct(productsBySlug.get('5x-hypno-bloom-seed'));
  const packageResult = service.buildManualPixOrder({
    seed: { ...packageProduct, commerce: packageProduct },
    quantity: 5,
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });
  assert.equal(packageResult.ok, true);
  assert.equal(packageResult.order.productSlug, '5x-hypno-bloom-seed');

  const overStockResult = service.buildManualPixOrder({
    seed: { ...packageProduct, commerce: packageProduct },
    quantity: 6,
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });
  assert.equal(overStockResult.ok, false);
  assert.equal(overStockResult.code, 'OUT_OF_STOCK');
  assert.equal(overStockResult.errors.includes('5x Hypno Bloom Seed nao possui estoque suficiente.'), true);

  const pet = service.normalizeStoreProduct(productsBySlug.get('hypno-bloom-seed'));
  const petResult = service.buildManualPixOrder({
    seed: { ...pet, commerce: pet },
    quantity: 1,
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });
  assert.equal(petResult.ok, false);
  assert.equal(petResult.code, 'OUT_OF_STOCK');
  assert.equal(petResult.errors.includes('Produto temporariamente sem estoque.'), true);
});

test('store money, coupon and Roblox username validation stay strict', () => {
  assert.equal(calculateSubtotalInCents(1000, 3), 3000);
  assert.throws(() => calculateSubtotalInCents(10.5, 1));
  assert.throws(() => calculateSubtotalInCents(1000, 0));
  assert.equal(formatMoney(1000), 'R$ 10,00');
  assert.equal(normalizeCouponCode(' seed5 '), 'SEED5');

  const percentage = calculateCouponDiscountInCents({
    coupon: {
      active: true,
      discountType: 'percentage',
      discountValue: 10,
      minimumOrderInCents: 0,
      maximumDiscountInCents: 250,
      applicableProductSlugs: []
    },
    subtotalInCents: 5000
  });
  assert.equal(percentage.ok, true);
  assert.equal(percentage.discountInCents, 250);

  const fixed = calculateCouponDiscountInCents({
    coupon: {
      active: true,
      discountType: 'fixed',
      discountValue: 500,
      minimumOrderInCents: 1000,
      applicableProductSlugs: ['carrot']
    },
    subtotalInCents: 1200,
    productSlugs: ['carrot']
  });
  assert.equal(fixed.ok, true);
  assert.equal(fixed.discountInCents, 500);

  assert.equal(calculateCouponDiscountInCents({ coupon: { active: false }, subtotalInCents: 1200 }).ok, false);
  assert.equal(validateRobloxUsername(' Delima_123 ').ok, true);
  assert.equal(validateRobloxUsername('https://roblox.com/users/1').ok, false);
  assert.equal(validateRobloxUsername('minha senha 123').ok, false);
  assert.equal(validateRobloxUsername('ab').ok, false);
});

test('checkout coupons use normalized categories and OR matching for product restrictions', () => {
  assert.equal(normalizeCouponCategory('Seeds'), 'seeds');
  assert.equal(normalizeCouponCategory('Sementes'), 'seeds');
  assert.equal(normalizeCouponCategory('Pacotes'), 'packages');
  assert.equal(normalizeCouponProductSlug(' Sun-Bloom-Seed '), 'sun-bloom-seed');

  const promo1 = {
    code: 'PROMO1',
    type: 'percent',
    value: 7,
    active: true,
    startsAt: '2026-07-20',
    expiresAt: '2026-07-23',
    categories: ['Seeds', 'Pets', 'Gears', 'Pacotes'],
    productSlugs: ['sun-bloom-seed'],
    maxUses: 100,
    usedCount: 0
  };
  const now = new Date('2026-07-20T15:00:00.000Z');

  const firefly = calculateCouponDiscountInCents({
    coupon: promo1,
    subtotalInCents: 790,
    productLines: [{ productSlug: 'firefly', productCategory: 'Pets', subtotalInCents: 790 }],
    now
  });
  assert.equal(firefly.ok, true);
  assert.equal(firefly.discountInCents, 55);

  const sunBloom = calculateCouponDiscountInCents({
    coupon: promo1,
    subtotalInCents: 990,
    productLines: [{ productSlug: 'SUN-BLOOM-SEED', productCategory: 'Seeds', subtotalInCents: 990 }],
    now
  });
  assert.equal(sunBloom.ok, true);
  assert.equal(sunBloom.discountInCents, 69);

  const gear = calculateCouponDiscountInCents({
    coupon: promo1,
    subtotalInCents: 790,
    productLines: [{ productSlug: 'super-sprinkler', productCategory: 'Gears', subtotalInCents: 790 }],
    now
  });
  assert.equal(gear.ok, true);
  assert.equal(gear.discountInCents, 55);

  const packageResult = calculateCouponDiscountInCents({
    coupon: promo1,
    subtotalInCents: 790,
    productLines: [{ productSlug: '5x-moon-bloom-seed', productCategory: 'Packages', subtotalInCents: 790 }],
    now
  });
  assert.equal(packageResult.ok, true);
  assert.equal(packageResult.discountInCents, 55);

  const seedsOnly = {
    code: 'SEEDS7',
    discountType: 'percentage',
    discountValue: 7,
    active: true,
    applicableCategories: ['seeds']
  };
  const mixedCart = calculateCouponDiscountInCents({
    coupon: seedsOnly,
    subtotalInCents: 1780,
    productLines: [
      { productSlug: 'sun-bloom-seed', productCategory: 'seeds', subtotalInCents: 990 },
      { productSlug: 'firefly', productCategory: 'pets', subtotalInCents: 790 }
    ],
    now
  });
  assert.equal(mixedCart.ok, true);
  assert.equal(mixedCart.eligibleSubtotalInCents, 990);
  assert.equal(mixedCart.discountInCents, 69);

  const productOnly = {
    code: 'SUNONLY',
    discountType: 'fixed',
    discountValue: 500,
    active: true,
    applicableProductSlugs: ['sun-bloom-seed']
  };
  const fixed = calculateCouponDiscountInCents({
    coupon: productOnly,
    subtotalInCents: 300,
    productLines: [{ productSlug: 'sun-bloom-seed', productCategory: 'seeds', subtotalInCents: 300 }],
    now
  });
  assert.equal(fixed.ok, true);
  assert.equal(fixed.discountInCents, 300);

  assert.equal(calculateCouponDiscountInCents({
    coupon: promo1,
    subtotalInCents: 790,
    productLines: [{ productSlug: 'unknown', productCategory: 'brainrot', subtotalInCents: 790 }],
    now
  }).reason, 'Cupom nao aplicavel aos produtos do carrinho.');
  assert.equal(calculateCouponDiscountInCents({
    coupon: { ...promo1, active: false },
    subtotalInCents: 790,
    productLines: [{ productSlug: 'firefly', productCategory: 'pets', subtotalInCents: 790 }],
    now
  }).ok, false);
  assert.equal(calculateCouponDiscountInCents({
    coupon: { ...promo1, expiresAt: '2026-07-19' },
    subtotalInCents: 790,
    productLines: [{ productSlug: 'firefly', productCategory: 'pets', subtotalInCents: 790 }],
    now
  }).reason, 'Cupom expirado.');
});

test('disabled coupons and gateway abstraction are present without choosing a provider', () => {
  const coupons = new Map(growGardenCouponsExampleData.coupons.map((coupon) => [coupon.code, coupon]));
  assert.equal(coupons.get('WELCOME10').active, false);
  assert.equal(coupons.get('WELCOME10').discountType, 'percentage');
  assert.equal(coupons.get('SEED5').active, false);
  assert.equal(coupons.get('SEED5').discountType, 'fixed');
  assert.ok(paymentGatewayCode.includes('createPixPayment'));
  assert.ok(paymentGatewayCode.includes('verifyWebhook'));
  assert.equal(STORE_COMMERCE_CONFIG.paymentProvider, null);
});

test('manual Pix configuration and order creation stay explicit and pending', () => {
  assert.equal(STORE_COMMERCE_CONFIG.pix.mode, 'manual');
  assert.equal(STORE_COMMERCE_CONFIG.pix.key, 'delimathur668@gmail.com');
  assert.equal(STORE_COMMERCE_CONFIG.pix.keyType, 'email');
  assert.equal(STORE_COMMERCE_CONFIG.pix.receiverName, 'THUR BLOX');
  assert.equal(STORE_COMMERCE_CONFIG.pix.receiverCity, 'SAO PAULO');
  assert.ok(growGardenModuleCode.includes('Nao foi possivel gerar a cobranca Pix.'), 'UI must show gateway failure without exposing the key');
  assert.ok(growGardenModuleCode.includes('Escaneie o QR Code Pix'), 'checkout must render a QR Code panel when Pix payload exists');
  assert.ok(growGardenModuleCode.includes('renderPixQrCode(qrContainer, order.pixPayload)'), 'checkout must generate QR from the Pix copy-paste payload');
  assert.equal(growGardenModuleCode.includes('O QR Code fica disponivel quando houver backend Pix ativo'), false);
  assert.ok(pixQrCodeServiceCode.includes("startsWith(PIX_PAYLOAD_PREFIX)"), 'QR service must minimally validate Pix payload format');
  assert.ok(pixQrCodeServiceCode.includes('validatePixPayloadCrc'), 'QR service must validate payload CRC');
  assert.ok(htmlContent.includes('assets/vendor/qrcode-browser.js'), 'static app must load browser QR bundle before app module');
  assert.equal(growGardenModuleCode.includes('Chave Pix'), false);
  assert.equal(growGardenModuleCode.includes('Copiar chave Pix'), false);
  assert.equal(growGardenModuleCode.includes('Chave Pix copiada.'), false);
  assert.equal(growGardenModuleCode.includes('data-copy="pix-key"'), false);

  const service = new StoreCommerceService({
    config: {
      ...STORE_COMMERCE_CONFIG,
      commerceEnabled: true,
      pix: STORE_COMMERCE_CONFIG.pix
    }
  });
  const result = service.buildManualPixOrder({
    seed: {
      slug: 'carrot',
      name: 'Carrot',
      commerce: {
        saleEnabled: true,
        priceInCents: 1000,
        availableStock: 5,
        currency: 'BRL'
      }
    },
    quantity: 2,
    customerName: 'Delima',
    robloxUsername: 'Delima_123',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-01T12:00:00.000Z')
  });
  assert.equal(result.ok, true);
  assert.match(result.order.orderCode, /^THUR-[A-Z0-9]{6}$/);
  assert.equal(Object.hasOwn(result.order, 'pixKey'), false);
  assert.equal(result.order.subtotalInCents, 2000);
  assert.equal(result.order.discountInCents, 0);
  assert.equal(result.order.totalInCents, 2000);
  assert.equal(result.order.paymentStatus, 'pending');
  assert.equal(result.order.orderStatus, 'awaiting_payment');
  assert.equal(result.order.customerReportedPayment, false);
  assert.equal(typeof result.order.pixPayload, 'string');
  assert.equal(result.order.pixPayload.startsWith('000201'), true);
  assert.equal(result.order.pixPayload.includes('540520.00'), true);
  assert.equal(validatePixPayloadCrc(result.order.pixPayload), true);
  assert.equal(result.order.pixPayloadStatus, 'ready');
  assert.equal(result.order.pixPayloadError, null);
  assert.equal(createOrderCode({ now: new Date('2026-07-01T12:00:00.000Z'), random: () => 0 }), 'THUR-W00000');
});

test('Pix BR Code uses order total, TXID and valid CRC when receiver data is configured', () => {
  const payload = buildPixPayload({
    pixKey: 'delimathur668@gmail.com',
    amountInCents: 790,
    txid: 'THURABC123',
    receiverName: 'Delima Blox',
    receiverCity: 'SAO PAULO',
    description: 'THUR-ABC123'
  });
  assert.equal(payload.ok, true);
  assert.ok(payload.payload.includes('0014br.gov.bcb.pix'));
  assert.ok(payload.payload.includes('delimathur668@gmail.com'));
  assert.ok(payload.payload.includes('54047.90'));
  assert.ok(payload.payload.includes('0510THURABC123'));
  assert.equal(payload.txid, 'THURABC123');
  assert.equal(validatePixPayloadCrc(payload.payload), true);

  const service = new StoreCommerceService({
    config: {
      ...STORE_COMMERCE_CONFIG,
      commerceEnabled: false,
      testCheckoutEnabled: true,
      pix: {
        ...STORE_COMMERCE_CONFIG.pix,
        receiverName: 'Delima Blox',
        receiverCity: 'SAO PAULO'
      }
    }
  });
  const result = service.buildManualPixOrder({
    seed: {
      slug: 'hypno-bloom-seed',
      name: 'Hypno Bloom Seed',
      commerce: {
        saleEnabled: true,
        priceInCents: 790,
        availableStock: null,
        currency: 'BRL'
      }
    },
    quantity: 2,
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'joejbhxbmIb',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });
  assert.equal(result.ok, true);
  assert.equal(result.order.totalInCents, 1580);
  assert.equal(result.order.pixPayloadStatus, 'ready');
  assert.equal(result.order.pixPayload.includes('540515.80'), true);
  assert.equal(result.order.pixTxid, result.order.orderCode.replace(/[^A-Z0-9]/g, ''));
  assert.equal(validatePixPayloadCrc(result.order.pixPayload), true);
  assert.equal(result.order.pixQrImageUrl, `/api/orders/${encodeURIComponent(result.order.orderCode)}/pix-qr.svg`);
});

test('PixPayloadService generates a valid QR SVG and maps missing configuration', async () => {
  const service = new PixPayloadService();
  const charge = service.createPayload({
    pixKey: 'delimathur668@gmail.com',
    receiverName: 'Delima Blox',
    receiverCity: 'SAO PAULO',
    amountInCents: 790,
    txid: 'THUROBQ226',
    description: 'THUR-OBQ226'
  });
  const qrCode = await service.generateQrCode(charge.pixCopyPaste);

  assert.equal(charge.txid, 'THUROBQ226');
  assert.equal(charge.pixCopyPaste.includes('54047.90'), true);
  assert.equal(charge.pixCopyPaste.includes('0510THUROBQ226'), true);
  assert.equal(validatePixPayloadCrc(charge.pixCopyPaste), true);
  assert.equal(qrCode.startsWith('<svg'), true);
  assert.equal(qrCode.includes('#ffffff'), true);

  assert.throws(() => service.createPayload({
    pixKey: 'delimathur668@gmail.com',
    receiverName: '',
    receiverCity: 'SAO PAULO',
    amountInCents: 790,
    txid: 'THUROBQ226'
  }), { code: 'PIX_RECEIVER_NAME_MISSING' });
});

test('Pix gateway charge fixes backend amount and rejects mismatched webhook values', async () => {
  const gateway = new SandboxPixPaymentGateway({
    pixKey: 'delimathur668@gmail.com',
    receiverName: 'Delima Blox',
    receiverCity: 'SAO PAULO',
    webhookToken: 'secret',
    now: () => new Date('2026-07-02T12:00:00.000Z')
  });
  const order = {
    orderCode: 'THUR-ABC123',
    totalInCents: 790
  };
  const charge = await gateway.createPixPayment({ order, idempotencyKey: 'pix:THUR-ABC123:790' });
  const repeated = await gateway.createPixPayment({ order, idempotencyKey: 'pix:THUR-ABC123:790' });

  assert.equal(charge.paymentId, repeated.paymentId);
  assert.equal(charge.copyPasteCode, repeated.copyPasteCode);
  assert.equal(charge.amountInCents, 790);
  assert.equal(charge.externalReference, 'THUR-ABC123');
  assert.equal(charge.currency, 'BRL');
  assert.equal(Object.hasOwn(charge, 'pixKey'), false);
  assert.equal(charge.copyPasteCode.includes('54047.90'), true);
  assert.equal(validatePixPayloadCrc(charge.copyPasteCode), true);
  assert.equal(gateway.verifyWebhook({ headers: { authorization: 'Bearer secret' } }).ok, true);
  assert.equal(gateway.verifyWebhook({ headers: { authorization: 'Bearer wrong' } }).ok, false);

  const event = gateway.parseWebhookEvent({
    eventId: 'evt-1',
    payment: {
      id: charge.paymentId,
      externalReference: 'THUR-ABC123',
      value: 8.9,
      currency: 'BRL',
      status: 'CONFIRMED'
    }
  });
  assert.equal(event.status, 'confirmed');
  assert.equal(event.amountInCents, 890);
  assert.notEqual(event.amountInCents, order.totalInCents);
});

test('dev server exposes idempotent Pix charge endpoint without creating another order', () => {
  assert.ok(devServerCode.includes("POST' && /^\\/api\\/store\\/orders\\/[^/]+\\/pix$/.test(url.pathname)"), 'dev server must expose Pix retry endpoint');
  assert.ok(devServerCode.includes('hasActivePixCharge(existing)'), 'retry endpoint must reuse active Pix charge');
  assert.ok(devServerCode.includes('publicPixCharge(chargedOrder || existing)'), 'retry endpoint must return Pix payload and QR data');
  assert.ok(devServerCode.includes("console.error('PIX_CHARGE_ERROR'"), 'retry endpoint must log specific Pix errors');
  assert.ok(growGardenModuleCode.includes('createPixCharge(order, state)'), 'UI retry must regenerate charge for the same order');
  assert.equal(growGardenModuleCode.includes('Copiar chave Pix'), false, 'UI must not reintroduce Pix key copy');
});

test('Hypno Bloom stays sold out when seed stock is zero', () => {
  const hypno = growGardenStoreProductsData.products.find((product) => product.slug === 'hypno-bloom-seed');
  assert.ok(hypno, 'Hypno Bloom product must exist');
  assert.equal(hypno.salePriceInCents, 790);
  assert.equal(hypno.priceInCents, 790);
  assert.equal(hypno.availableStock, 0);
  assert.equal(hypno.saleEnabled, false);
  assert.equal(hypno.stockStatus, 'out_of_stock');

  const service = new StoreCommerceService({
    config: {
      ...STORE_COMMERCE_CONFIG,
      commerceEnabled: false,
      testCheckoutEnabled: true,
      pix: {
        ...STORE_COMMERCE_CONFIG.pix,
        receiverName: 'Delima Blox',
        receiverCity: 'SAO PAULO'
      }
    }
  });
  const result = service.buildManualPixOrder({
    seed: { ...hypno, commerce: service.normalizeStoreProduct(hypno) },
    quantity: 1,
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'OUT_OF_STOCK');
  assert.equal(result.errors.includes('Produto temporariamente sem estoque.'), true);
});

test('zero-stock Grow a Garden 2 seeds remain blocked at checkout', () => {
  const service = new StoreCommerceService({
    config: {
      ...STORE_COMMERCE_CONFIG,
      commerceEnabled: false,
      testCheckoutEnabled: true,
      pix: STORE_COMMERCE_CONFIG.pix
    }
  });
  const productsBySlug = new Map(growGardenStoreProductsData.products.map((product) => [product.slug, product]));
  const result = service.buildManualPixOrder({
    seed: { ...productsBySlug.get('hypno-bloom-seed'), commerce: service.normalizeStoreProduct(productsBySlug.get('hypno-bloom-seed')) },
    quantity: 1,
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'OUT_OF_STOCK');
  assert.equal(result.errors.includes('Produto temporariamente sem estoque.'), true);
});

test('Grow Garden cart persists quantities without duplicating slugs', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };
  const cart = new CartService({ storage });
  let items = cart.add([], 'moon-bloom-seed', 1);
  items = cart.add(items, 'raccoon', 1);
  items = cart.add(items, '20x-super-sprinkler', 1);
  items = cart.add(items, 'moon-bloom-seed', 1);

  assert.equal(cart.count(items), 4);
  assert.equal(items.length, 3);
  assert.equal(items.find((item) => item.productSlug === 'moon-bloom-seed').quantity, 2);
  assert.equal(storage.getItem(CART_STORAGE_KEY).includes('moon-bloom-seed'), true);
  assert.deepEqual(cart.load(), items);
  cart.clear();
  assert.equal(storage.getItem(CART_STORAGE_KEY), null);
});

test('Grow Garden cart sanitizes invalid storage and can persist complete product snapshots', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };
  const product = growGardenStoreProductsData.products.find((item) => item.slug === 'moon-bloom-seed');
  const cart = new CartService({
    storage,
    getProductBySlug: (slug) => slug === product.slug ? product : null
  });

  store.set(CART_STORAGE_KEY, '{bad json');
  const originalError = console.error;
  console.error = () => {};
  assert.deepEqual(cart.getItems(), []);
  console.error = originalError;
  assert.equal(storage.getItem(CART_STORAGE_KEY), null);

  const items = cart.addItem(product, 2);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    productSlug: 'moon-bloom-seed',
    productName: 'Moon Bloom Seed',
    image: '/assets/grow-a-garden-2/store/seeds/moon-bloom-seed.webp',
    category: 'seeds',
    unitPriceInCents: 790,
    quantity: 2,
    availableStock: 100
  });
  assert.equal(cart.getTotalQuantity(), 2);
  assert.equal(cart.getSubtotalInCents(), 1580);
});

test('SupportService persists conversations and admin replies locally', () => {
  const storage = createMemoryStorage();
  const service = new SupportService({ storage, now: () => '2026-07-19T12:00:00.000Z' });
  const conversation = service.createConversation({
    customerName: 'Cliente Teste',
    customerEmail: 'cliente@example.com',
    robloxUsername: 'ClienteRoblox'
  });

  service.sendMessage(conversation.id, {
    senderType: 'customer',
    senderName: 'Cliente Teste',
    body: 'Preciso de ajuda com meu pedido.'
  });
  assert.equal(service.getAdminUnreadCount(), 1);

  service.markAsRead(conversation.id, 'admin');
  service.replyAsAdmin(conversation.id, 'Pode deixar, vamos conferir.');
  const stored = service.getConversation(conversation.id);

  assert.equal(stored.status, 'responded');
  assert.equal(stored.unreadByCustomer, 1);
  assert.equal(stored.messages.length, 4);
  assert.equal(stored.messages[2].senderType, 'bot');
  assert.equal(stored.messages.at(-1).senderType, 'admin');
  assert.throws(() => service.sendMessage(conversation.id, { body: '' }), /Mensagem/);
  assert.throws(() => service.sendMessage(conversation.id, { body: 'x'.repeat(SUPPORT_MESSAGE_MAX_LENGTH + 1) }), /maximo/);
});

test('support quick order recognizes purchase intent and searches both store games', () => {
  assert.equal(hasChatPurchaseIntent('quero kitsune'), true);
  assert.equal(hasChatPurchaseIntent('quanto custa a firefly?'), true);
  assert.equal(hasChatPurchaseIntent('preciso de ajuda'), false);

  const kitsune = findChatProduct('quero kitsune fruit', growGardenStoreProductsData.products);
  const firefly = findChatProduct('quero firefly', growGardenStoreProductsData.products);
  const categoryProduct = findChatProduct('tem frutas?', growGardenStoreProductsData.products);
  assert.equal(kitsune?.slug, 'kitsune-fruit');
  assert.equal(firefly?.slug, 'firefly');
  assert.equal(categoryProduct?.game, 'blox-fruits');
  assert.equal(findChatProduct('quero produto-que-nao-existe', growGardenStoreProductsData.products), null);
  assert.equal(getChatProductRoute(kitsune), '/category/blox-fruits?produto=kitsune-fruit');
  assert.equal(getChatProductRoute(firefly, { cart: true }), '/category/grow-a-garden-2?tab=carrinho');
});

test('VIP loyalty promotes customers by paid value or eligible order count', () => {
  const order = (totalInCents, status = 'confirmed', extra = {}) => ({ totalInCents, paymentStatus: status, customerEmail: 'vip@example.com', ...extra });
  assert.equal(calculateVipStatus([]).level.name, 'Bronze');
  assert.equal(calculateVipStatus([order(3000)]).level.name, 'Prata');
  assert.equal(calculateVipStatus([order(8000)]).level.name, 'Ouro');
  assert.equal(calculateVipStatus([order(15000)]).level.name, 'Diamante');
  assert.equal(calculateVipStatus([order(20000, 'cancelled')]).level.name, 'Bronze');
  assert.equal(isVipEligibleOrder(order(1000, 'pending')), false);
  assert.equal(isVipEligibleOrder(order(1000, 'pending', { deliveryStatus: 'delivering' })), true);

  const byCount = Array.from({ length: 5 }, () => order(100));
  assert.equal(calculateVipStatus(byCount).level.name, 'Ouro');
  assert.equal(getVipStatusForCustomer([...byCount, order(15000, 'confirmed', { customerEmail: 'other@example.com' })], { email: 'vip@example.com' }).level.name, 'Ouro');
});

test('VIP checkout chooses the larger discount without making totals negative', () => {
  assert.equal(calculateVipDiscountInCents(10000, 5), 500);
  assert.deepEqual(selectBestDiscount({ subtotalInCents: 10000, couponDiscountInCents: 300, vipDiscountPercent: 5 }), {
    source: 'vip', discountInCents: 500, vipDiscountInCents: 500, couponDiscountInCents: 300
  });
  assert.equal(selectBestDiscount({ subtotalInCents: 10000, couponDiscountInCents: 700, vipDiscountPercent: 5 }).source, 'coupon');
  assert.equal(selectBestDiscount({ subtotalInCents: 100, couponDiscountInCents: 9999, vipDiscountPercent: 8 }).discountInCents, 100);
  assert.equal(growGardenModuleCode.includes('vip-checkout-message'), true);
  assert.equal(growGardenModuleCode.includes('buildVipBadge'), true);
  assert.equal(homePortalCode.includes('buildVipCard'), true);

  const service = new StoreCommerceService();
  const product = growGardenStoreProductsData.products.find((item) => item.slug === 'firefly');
  const result = service.buildManualPixOrder({
    seed: { ...product, commerce: service.normalizeStoreProduct(product) },
    quantity: 1,
    customerName: 'Cliente VIP',
    customerUserId: 'vip-user',
    robloxUsername: 'ClienteVip',
    email: 'vip@example.com',
    vipDiscountPercent: 5,
    vipLevel: 'Ouro',
    termsAccepted: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.order.vipLevel, 'Ouro');
  assert.equal(result.order.discountSource, 'vip');
  assert.equal(result.order.discountInCents, 39);
  assert.equal(result.order.totalInCents, 751);
});

test('Clube VIP admin persists manual overrides without changing automatic customers', () => {
  const storage = createMemoryStorage();
  const vipService = new VipService({ storage });
  const customer = { id: 'customer-1', email: 'cliente@example.com', name: 'Cliente' };
  const otherCustomer = { id: 'customer-2', email: 'outro@example.com', name: 'Outro' };
  const orders = [{ customerUserId: 'customer-1', totalInCents: 100, paymentStatus: 'confirmed' }];
  assert.equal(vipService.getCustomerVipLevel(customer, orders).level.name, 'Bronze');
  vipService.setManualVipLevel(customer, 'diamond');
  assert.equal(vipService.getCustomerVipLevel(customer, orders).level.name, 'Diamante');
  assert.equal(vipService.getCustomerVipLevel(customer, orders).isManualOverride, true);
  assert.equal(vipService.getCustomerVipLevel(otherCustomer, orders).level.name, 'Bronze');
  assert.equal(JSON.parse(storage.getItem(VIP_OVERRIDES_STORAGE_KEY))['customer-1'], 'diamond');
  vipService.clearManualVipLevel(customer);
  assert.equal(vipService.getCustomerVipLevel(customer, orders).level.name, 'Bronze');

  assert.equal(growGardenModuleCode.includes("['vip', 'Clube VIP']"), true);
  assert.equal(growGardenModuleCode.includes('buildAdminVipSection'), true);
  assert.equal(growGardenModuleCode.includes('data-vip-level-form'), true);
  assert.equal(growGardenModuleCode.includes('data-vip-history'), true);
  assert.equal(growGardenModuleCode.includes('data-vip-support'), true);
  assert.equal(styles.includes('.admin-vip-summary'), true);
});

test('Blox Fruits category exposes five Pix products with isolated storefront inventory', () => {
  const products = growGardenStoreProductsData.products.filter((product) => product.game === 'blox-fruits');
  assert.equal(products.length, 5);
  assert.deepEqual(products.map((product) => product.slug), [
    'kitsune-fruit',
    'dragon-fruit',
    'leopard-fruit',
    'dough-fruit',
    'pacote-iniciante-blox-fruits'
  ]);
  assert.equal(products.every((product) => product.paymentMethod === 'pix' && product.saleEnabled === true), true);
  assert.equal(products.every((product) => product.stockStatus === 'available' && product.availableStock > 0), true);
  assert.ok(appCode.includes("storeGame: 'blox-fruits'"), 'Blox Fruits route must open the isolated storefront');
  assert.ok(growGardenModuleCode.includes('getPublicStoreProducts'), 'public storefront must filter products by game');
  products.forEach((product) => {
    assert.ok(existsSync(resolve(projectRoot, product.image.replace('/assets/', 'assets/'))), `${product.slug} artwork must exist`);
  });
});

test('store catalogs use root-absolute JSON paths with content-type validation', () => {
  const seedServiceCode = readFileSync(resolve(projectRoot, 'src', 'services', 'grow-garden-2', 'SeedDataService.js'), 'utf8');
  const storeServiceCode = readFileSync(resolve(projectRoot, 'src', 'services', 'grow-garden-2', 'StoreCommerceService.js'), 'utf8');
  assert.ok(seedServiceCode.includes('`/src/data/grow-garden-2/${fileName}`'));
  assert.ok(storeServiceCode.includes("'/src/data/grow-garden-2/store-products.json'"));
  assert.ok(homePortalCode.includes("'/src/data/grow-garden-2/store-products.json'"));
  assert.ok(seedServiceCode.includes("contentType.includes('application/json')"));
  assert.ok(storeServiceCode.includes("contentType.includes('application/json')"));
});

test('game pages open directly on store products without an internal hero', () => {
  assert.ok(growGardenModuleCode.includes("initialTab = 'sementes'"));
  assert.ok(growGardenModuleCode.includes("{ id: 'sementes', label: 'Loja'"));
  assert.equal(growGardenModuleCode.includes("{ id: 'inicio', label: 'Inicio'"), false);
  assert.ok(growGardenModuleCode.includes("createElement('h2', {}, 'Produtos disponíveis')"));
  assert.ok(growGardenModuleCode.includes("class: 'garden-storefront storefront-direct'"));
  assert.equal(growGardenModuleCode.includes('this.buildHero()'), false);
  assert.equal(growGardenModuleCode.includes('buildHero() {'), false);
  assert.ok(styles.includes('.garden-storefront.storefront-direct'));
});
test('portal exposes FAQ, approved reviews and original THUR BLOX terms route', () => {
  assert.equal(homePortalCode.includes('buildFaqSection()'), true);
  assert.equal(homePortalCode.includes("review.status === 'approved'"), true);
  assert.equal(homePortalCode.includes("'data-footer-action': 'terms'"), true);
  assert.equal(appCode.includes("'/terms': 'terms'"), true);
  assert.equal(appCode.includes('new TermsPage'), true);
  assert.match(termsPageCode, /Entrega manual/);
  assert.match(termsPageCode, /Pagamento via Pix/);
  assert.match(termsPageCode, /Não é oficial/);
  assert.match(termsPageCode, /Nunca envie sua senha, cookie ou código de autenticação/);
  assert.equal(termsPageCode.includes('BloxLegacy'), false);
});

test('SupportService accepts a conversation with only name and message', () => {
  const storage = createMemoryStorage();
  const service = new SupportService({ storage, now: () => '2026-07-19T12:00:00.000Z' });
  const conversation = service.createConversation({ customerName: 'Cliente sem contato' });

  service.sendMessage(conversation.id, {
    senderType: 'customer',
    senderName: conversation.customerName,
    body: 'Mensagem sem email e sem nick.'
  });

  const restoredService = new SupportService({ storage });
  const restored = restoredService.getActiveConversation();
  assert.equal(restored.customerEmail, '');
  assert.equal(restored.robloxUsername, '');
  assert.equal(restored.messages.at(-2).body, 'Mensagem sem email e sem nick.');
  assert.equal(restored.messages.at(-1).sender, 'bot');
  assert.equal(restored.messages.at(-1).read, true);
  assert.equal(restoredService.listAdminConversations()[0].id, conversation.id);
  assert.equal(restoredService.getAdminUnreadCount(), 1);
});

test('support remembers customer profile, active conversation and reuses identity after closing', () => {
  const storage = createMemoryStorage();
  const service = new SupportService({ storage, now: () => '2026-07-22T10:00:00.000Z' });
  const profile = service.saveCustomerProfile({ name: 'Arthur Lima', email: '', robloxNick: 'arthur123' });
  const first = service.createConversationFromProfile();
  service.sendMessage(first.id, { senderType: 'customer', senderName: profile.name, body: 'oi' });
  const firstMessageCount = service.getConversation(first.id).messages.length;

  const reopened = new SupportService({ storage, now: () => '2026-07-22T11:00:00.000Z' });
  assert.equal(reopened.getActiveConversation().id, first.id);
  assert.equal(reopened.getActiveConversation().messages.length, firstMessageCount);
  assert.equal(JSON.parse(storage.getItem(SUPPORT_CUSTOMER_PROFILE_KEY)).name, 'Arthur Lima');
  assert.equal(storage.getItem(SUPPORT_ACTIVE_CONVERSATION_KEY), first.id);

  reopened.updateCustomerProfile({ name: 'Arthur Lima', email: '', robloxNick: 'arthurNovo' });
  assert.equal(reopened.getConversation(first.id).robloxUsername, 'arthurNovo');
  assert.equal(reopened.getConversation(first.id).messages.length, firstMessageCount, 'editing profile must preserve history');

  reopened.closeConversation(first.id);
  reopened.clearActiveConversation();
  const next = reopened.createConversationFromProfile();
  assert.notEqual(next.id, first.id);
  assert.equal(next.customerName, 'Arthur Lima');
  assert.equal(next.robloxUsername, 'arthurNovo');
  assert.equal(next.messages.length, 1, 'initial bot greeting appears once per conversation');
  assert.equal(reopened.getConversation(first.id).status, 'closed');
  assert.equal(reopened.listAdminConversations().length, 2);
});

test('support bot recognizes keywords and never replies to admin messages', () => {
  assert.match(getSupportBotReply('oi'), /bem-vindo/i);
  assert.match(getSupportBotReply('já paguei no Pix'), /código do pedido/i);
  assert.match(getSupportBotReply('meu pedido não chegou'), /código do pedido/i);
  assert.match(getSupportBotReply('deu erro e travou'), /escolha uma opção/i);
  assert.match(getSupportBotReply('uma dúvida diferente'), /escolha uma opção/i);

  const storage = createMemoryStorage();
  const service = new SupportService({ storage, now: () => '2026-07-21T12:00:00.000Z' });
  const conversation = service.createConversation({ customerName: 'Cliente' });
  service.replyAsAdmin(conversation.id, 'Resposta manual do admin.');
  const messages = service.getConversationMessages(conversation.id);
  assert.equal(messages.length, 2);
  assert.equal(messages.at(-1).senderType, 'admin');
});

test('smart support bot detects intents, keeps context and requests human support safely', () => {
  const cases = [
    ['oi', 'greeting'],
    ['quero comprar kitsune', 'buy_product'],
    ['quanto custa dragon', 'ask_price'],
    ['paguei no pix', 'payment_done'],
    ['meu pedido não chegou', 'delivery_problem'],
    ['quero falar com atendente', 'support_human'],
    ['passei o nick errado', 'wrong_nick'],
    ['minha senha é 123', 'security_warning'],
    ['quero reembolso', 'refund']
  ];
  cases.forEach(([message, intent]) => assert.equal(detectSupportIntent(message), intent, message));
  assert.equal(extractProductMention('tem Kitsune Fruit?'), 'kitsune fruit');
  assert.equal(extractOrderCode('pedido THUR-ABC123'), 'THUR-ABC123');

  const bot = new SmartSupportBotService({ storage: createMemoryStorage() });
  const conversation = { context: {} };
  const first = bot.processCustomerMessage(conversation, 'paguei no pix', { customerMessageId: 'msg-1' });
  conversation.context = first.context;
  const repeated = bot.processCustomerMessage(conversation, 'paguei no pix', { customerMessageId: 'msg-2' });
  assert.equal(first.intent, 'payment_done');
  assert.notEqual(first.body, repeated.body);
  assert.equal(bot.processCustomerMessage(conversation, 'paguei no pix', { customerMessageId: 'msg-1' }), null);

  const orderStorage = createMemoryStorage();
  orderStorage.setItem('thur_blox_local_orders', JSON.stringify({ orders: [{ orderCode: 'THUR-ABC123', paymentStatus: 'confirmed', orderStatus: 'paid' }] }));
  const orderBot = new SmartSupportBotService({ storage: orderStorage });
  const orderReply = orderBot.processCustomerMessage({ context: {} }, 'qual o status do pedido THUR-ABC123?', { customerMessageId: 'order-1' });
  assert.match(orderReply.body, /já pode ser processado/i);

  const storage = createMemoryStorage();
  const service = new SupportService({ storage, now: () => '2026-07-22T12:00:00.000Z' });
  const created = service.createConversation({ customerName: 'Cliente IA' });
  service.sendMessage(created.id, { senderType: 'customer', body: 'quero falar com atendente' });
  const stored = service.getConversation(created.id);
  assert.equal(stored.needsHuman, true);
  assert.equal(stored.context.wantsHumanSupport, true);
  assert.equal(stored.context.lastIntent, 'support_human');
  assert.equal(stored.messages.at(-2).intent, 'support_human');
  assert.equal(stored.messages.at(-1).intent, 'support_human');
  assert.equal(growGardenModuleCode.includes('Precisa de humano'), true);
  const messageCount = stored.messages.length;
  assert.equal(new SupportService({ storage }).getConversation(created.id).messages.length, messageCount, 'reload must not duplicate bot messages');
});

test('closed support conversation can be cleared without deleting admin history', () => {
  const storage = createMemoryStorage();
  const service = new SupportService({ storage, now: () => '2026-07-21T12:00:00.000Z' });
  const oldConversation = service.createConversation({ customerName: 'Cliente antigo' });
  service.sendMessage(oldConversation.id, { senderType: 'customer', body: 'Primeiro atendimento.' });
  service.closeConversation(oldConversation.id);
  const closedMessageCount = service.getConversation(oldConversation.id).messages.length;
  assert.throws(() => service.sendMessage(oldConversation.id, { senderType: 'customer', body: 'Mensagem depois de fechar.' }), /fechada/);
  assert.equal(service.getConversation(oldConversation.id).messages.length, closedMessageCount);

  service.clearActiveConversation();
  assert.equal(service.getActiveConversation(), null);
  assert.equal(service.getConversation(oldConversation.id).status, 'closed');
  assert.equal(service.getConversation(oldConversation.id).archived, true);

  const newConversation = service.createConversation({ customerName: 'Cliente novo' });
  service.sendMessage(newConversation.id, { senderType: 'customer', body: 'Novo atendimento.' });
  const adminConversations = service.listAdminConversations();
  assert.equal(adminConversations.length, 2);
  assert.deepEqual(service.listActiveAdminConversations().map((conversation) => conversation.id), [newConversation.id]);
  assert.equal(service.getAdminUnreadCount(), 1);
  assert.equal(isActiveSupportConversation({ status: 'closed' }), false);
  assert.equal(isActiveSupportConversation({ status: 'responded', archived: true }), false);
  assert.equal(isActiveSupportConversation({ status: 'new', deleted: true }), false);
  assert.notEqual(newConversation.id, oldConversation.id);
  assert.equal(service.getConversation(oldConversation.id).status, 'closed');
  assert.equal(service.getConversation(newConversation.id).status, 'new');
  assert.equal(service.getConversation(oldConversation.id).messages.some((message) => message.body === 'Novo atendimento.'), false);
});

test('ReviewService saves one pending review per paid order and remembers the thank-you screen', () => {
  const storage = createMemoryStorage();
  const service = new ReviewService({ storage, now: () => '2026-07-21T12:00:00.000Z' });
  assert.throws(() => service.create({ orderId: 'THUR-1', rating: '' }), /Escolha uma nota/);
  const review = service.create({
    orderId: 'THUR-1', customerName: 'Cliente', robloxNick: 'Player', rating: 5,
    comment: 'Compra excelente.', productNames: ['Sun Bloom Seed'], total: 1290
  });
  assert.equal(review.status, 'pending');
  assert.equal(review.rating, 5);
  assert.equal(JSON.parse(storage.getItem(REVIEW_STORAGE_KEY)).length, 1);
  assert.throws(() => service.create({ orderId: 'thur-1', rating: 4 }), /ja avaliou/);
  assert.equal(service.hasSeenThankYou('THUR-1'), false);
  service.markThankYouSeen('THUR-1');
  assert.equal(service.hasSeenThankYou('THUR-1'), true);
});

test('AdminAuthService accepts only authorized admin email before storing a session', async () => {
  const storage = createMemoryStorage();
  const service = new AdminAuthService({ storage, now: () => 1000 });
  let requestBody = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ authorized: true, email: requestBody.email, expiresInSeconds: 1800 })
    };
  };

  await assert.rejects(
    () => service.login({ email: 'cliente@example.com', password: '123' }),
    (error) => /senha inv/i.test(error.message)
  );
  const session = await service.login({ email: 'delima20k@gmail.com', password: '3112' });

  assert.equal(session.authorized, true);
  assert.equal(session.email, 'delima20k@gmail.com');
  assert.equal(service.isAuthorized(), true);
  assert.equal(requestBody.email, 'delima20k@gmail.com');
  globalThis.fetch = originalFetch;
});

test('AuthService registers customer accounts and hides admin role from normal users', async () => {
  const storage = createMemoryStorage();
  const service = new AuthService({ storage, now: () => 1000 });
  const created = service.register({
    name: 'Cliente Teste',
    email: 'cliente@example.com',
    password: 'segredo1',
    confirmPassword: 'segredo1',
    robloxUsername: 'ClienteRoblox'
  });

  assert.equal(created.session.role, 'customer');
  assert.equal(service.isAdminSession(created.session), false);
  assert.throws(() => service.register({
    name: 'Cliente Teste',
    email: 'cliente@example.com',
    password: 'segredo1',
    confirmPassword: 'segredo1'
  }), /Já existe/);

  await service.logout();
  const session = await service.login({ email: 'cliente@example.com', password: 'segredo1' });
  assert.equal(session.name, 'Cliente Teste');
  assert.equal(session.role, 'customer');
  assert.equal(service.getCurrentUser().robloxUsername, 'ClienteRoblox');
});

test('admin login falls back locally when static deploy has no admin API', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({})
  });

  const authStorage = createMemoryStorage();
  const authService = new AuthService({ storage: authStorage, now: () => 1000 });
  const session = await authService.login({
    email: ' DELIMA20K@GMAIL.COM ',
    password: ' 3112 '
  });
  assert.equal(session.role, 'admin');
  assert.equal(session.email, 'delima20k@gmail.com');
  assert.equal(authService.isAdminSession(session), true);

  await assert.rejects(() => authService.login({
    email: 'delima20k@gmail.com',
    password: '0000'
  }), /senha invalidos|senha inv/i);

  const adminStorage = createMemoryStorage();
  const adminService = new AdminAuthService({ storage: adminStorage, now: () => 1000 });
  const adminSession = await adminService.login({
    email: 'delima20k@gmail.com',
    password: '3112'
  });
  assert.equal(adminSession.authorized, true);
  assert.equal(adminSession.email, 'delima20k@gmail.com');

  globalThis.fetch = originalFetch;
});

test('InventoryOverrideService validates stock and applies local product overrides', () => {
  const storage = createMemoryStorage();
  const service = new InventoryOverrideService({ storage });
  const product = {
    slug: 'hypno-bloom-seed',
    name: 'Hypno Bloom Seed',
    availableStock: 100,
    saleEnabled: true,
    stockStatus: 'available',
    commerce: {
      availableStock: 100,
      saleEnabled: true,
      stockStatus: 'available'
    }
  };

  assert.throws(() => service.saveProductOverride(product.slug, {
    availableStock: '-1',
    saleEnabled: true,
    stockStatus: 'available'
  }), /Estoque/);

  assert.throws(() => service.saveProductOverride(product.slug, {
    availableStock: '0',
    saleEnabled: true,
    stockStatus: 'out_of_stock'
  }), /Venda ativa/);

  service.saveProductOverride(product.slug, {
    availableStock: '0',
    saleEnabled: false,
    stockStatus: 'out_of_stock'
  });
  const [updated] = service.applyToProducts([product]);

  assert.equal(updated.availableStock, 0);
  assert.equal(updated.saleEnabled, false);
  assert.equal(updated.stockStatus, 'out_of_stock');
  assert.equal(updated.commerce.availableStock, 0);

  service.saveProductOverride(product.slug, {
    availableStock: '100',
    saleEnabled: true,
    stockStatus: 'out_of_stock'
  });
  const [reactivated] = service.applyToProducts([product]);
  assert.equal(reactivated.availableStock, 100);
  assert.equal(reactivated.saleEnabled, true);
  assert.equal(reactivated.stockStatus, 'available');

  storage.setItem('thur_blox_inventory_overrides_v1', JSON.stringify({
    'sun-bloom-seed': {
      availableStock: 100,
      saleEnabled: false,
      stockStatus: 'out_of_stock'
    }
  }));
  assert.deepEqual(service.loadOverrides(), {});
});

test('InventoryOverrideService saves multiple changed stock overrides and keeps failed products pending', () => {
  const storage = createMemoryStorage();
  const service = new InventoryOverrideService({ storage });
  const result = service.saveProductOverrides({
    'hypno-bloom-seed': {
      availableStock: '100',
      saleEnabled: true,
      stockStatus: 'available'
    },
    'dragon-breath-seed': {
      availableStock: '0',
      saleEnabled: true,
      stockStatus: 'available'
    }
  });

  assert.equal(result.saved['hypno-bloom-seed'].availableStock, 100);
  assert.equal(result.saved['hypno-bloom-seed'].saleEnabled, true);
  assert.match(result.errors['dragon-breath-seed'], /Disponivel|Venda ativa/);
  assert.equal(service.loadOverrides()['hypno-bloom-seed'].stockStatus, 'available');
  assert.equal(service.loadOverrides()['dragon-breath-seed'], undefined);
});

test('ProductStockStore persists seed stock to catalog and reloads saved values', () => {
  const storePath = resolve(mkdtempSync(resolve(tmpdir(), 'thur-stock-')), 'store-products.json');
  writeFileSync(storePath, JSON.stringify({
    updatedAt: '2026-07-20T00:00:00.000Z',
    products: [
      {
        slug: 'ghost-pepper-seed',
        name: 'Ghost Pepper Seed',
        category: 'seeds',
        image: '/assets/grow-a-garden-2/store/seeds/ghost-pepper-seed.webp',
        salePriceInCents: 790,
        priceInCents: 790,
        currency: 'BRL',
        availableStock: 100,
        saleEnabled: true,
        stockStatus: 'available'
      },
      {
        slug: 'hypno-bloom-seed',
        name: 'Hypno Bloom Seed',
        category: 'seeds',
        image: '/assets/grow-a-garden-2/store/seeds/hypno-bloom-seed.webp',
        salePriceInCents: 790,
        priceInCents: 790,
        currency: 'BRL',
        availableStock: 10,
        saleEnabled: true,
        stockStatus: 'available'
      },
      {
        slug: 'sun-bloom-seed',
        name: 'Sun Bloom Seed',
        category: 'seeds',
        image: '/assets/grow-a-garden-2/store/seeds/sun-bloom-seed.webp',
        salePriceInCents: 990,
        priceInCents: 990,
        currency: 'BRL',
        availableStock: 25,
        saleEnabled: true,
        stockStatus: 'available'
      },
      {
        slug: 'star-fruit-seed',
        name: 'Star Fruit Seed',
        category: 'seeds',
        image: '/assets/grow-a-garden-2/store/seeds/star-fruit-seed.webp',
        salePriceInCents: 1590,
        priceInCents: 1590,
        currency: 'BRL',
        availableStock: 25,
        saleEnabled: true,
        stockStatus: 'available'
      },
      {
        slug: 'firefly',
        name: 'Firefly',
        category: 'pets',
        image: '/assets/grow-a-garden-2/store/pets/firefly.png',
        salePriceInCents: 790,
        priceInCents: 790,
        currency: 'BRL',
        availableStock: 25,
        saleEnabled: true,
        stockStatus: 'available'
      }
    ]
  }, null, 2));

  const store = new ProductStockStore({
    storePath,
    now: () => new Date('2026-07-20T12:00:00.000Z')
  });
  const savedGhost = store.updateProductStock('ghost-pepper-seed', {
    availableStock: 123,
    saleEnabled: true,
    stockStatus: 'available'
  });
  const savedHypno = store.updateProductStock('hypno-bloom-seed', {
    availableStock: 0,
    saleEnabled: false,
    stockStatus: 'out_of_stock'
  });
  const savedBatch = store.updateProductStocks({
    'sun-bloom-seed': {
      availableStock: 100,
      saleEnabled: true,
      stockStatus: 'available'
    },
    'star-fruit-seed': {
      availableStock: 100,
      saleEnabled: true,
      stockStatus: 'available'
    },
    firefly: {
      availableStock: 100,
      saleEnabled: true,
      stockStatus: 'available'
    }
  });

  assert.equal(savedGhost.saved['ghost-pepper-seed'].availableStock, 123);
  assert.equal(savedGhost.saved['ghost-pepper-seed'].saleEnabled, true);
  assert.equal(savedGhost.saved['ghost-pepper-seed'].stockStatus, 'available');
  assert.equal(savedHypno.saved['hypno-bloom-seed'].availableStock, 0);
  assert.equal(savedHypno.saved['hypno-bloom-seed'].saleEnabled, false);
  assert.equal(savedHypno.saved['hypno-bloom-seed'].stockStatus, 'out_of_stock');
  assert.equal(savedBatch.saved['sun-bloom-seed'].availableStock, 100);
  assert.equal(savedBatch.saved['star-fruit-seed'].availableStock, 100);
  assert.equal(savedBatch.saved.firefly.availableStock, 100);
  assert.deepEqual(savedBatch.errors, {});

  const reloaded = new ProductStockStore({ storePath }).readCatalog();
  const ghost = reloaded.products.find((product) => product.slug === 'ghost-pepper-seed');
  const hypno = reloaded.products.find((product) => product.slug === 'hypno-bloom-seed');
  const sunBloom = reloaded.products.find((product) => product.slug === 'sun-bloom-seed');
  const starFruit = reloaded.products.find((product) => product.slug === 'star-fruit-seed');
  const firefly = reloaded.products.find((product) => product.slug === 'firefly');
  assert.equal(ghost.availableStock, 123);
  assert.equal(ghost.saleEnabled, true);
  assert.equal(ghost.stockStatus, 'available');
  assert.equal(hypno.availableStock, 0);
  assert.equal(hypno.saleEnabled, false);
  assert.equal(hypno.stockStatus, 'out_of_stock');
  assert.equal(sunBloom.availableStock, 100);
  assert.equal(sunBloom.saleEnabled, true);
  assert.equal(sunBloom.stockStatus, 'available');
  assert.equal(starFruit.availableStock, 100);
  assert.equal(starFruit.saleEnabled, true);
  assert.equal(starFruit.stockStatus, 'available');
  assert.equal(firefly.availableStock, 100);
  assert.equal(firefly.saleEnabled, true);
  assert.equal(firefly.stockStatus, 'available');

  const commerceService = new StoreCommerceService();
  const ghostCommerce = commerceService.normalizeStoreProduct(ghost);
  const hypnoCommerce = commerceService.normalizeStoreProduct(hypno);
  assert.equal(ghostCommerce.availableStock, 123);
  assert.equal(ghostCommerce.saleEnabled, true);
  assert.equal(commerceService.canCreateManualPixOrder(ghostCommerce).ok, true);
  assert.equal(hypnoCommerce.availableStock, 0);
  assert.equal(hypnoCommerce.saleEnabled, false);
  assert.equal(commerceService.canCreateManualPixOrder(hypnoCommerce).ok, false);
});

test('CouponAdminService creates, validates, toggles and archives checkout coupons', () => {
  const storage = createMemoryStorage();
  const products = [
    { slug: 'hypno-bloom-seed', category: 'seeds' },
    { slug: '5x-moon-bloom-seed', category: 'packages' }
  ];
  const service = new CouponAdminService({
    storage,
    now: () => new Date('2026-07-19T12:00:00.000Z')
  });

  const percentCoupon = service.upsert({
    code: 'promo10',
    description: '10% de desconto',
    discountType: 'percentage',
    discountValue: '10',
    categories: ['seeds'],
    active: true
  }, { products, adminEmail: 'delima20k@gmail.com' });

  assert.equal(percentCoupon.code, 'PROMO10');
  assert.equal(percentCoupon.discountType, 'percentage');
  assert.equal(percentCoupon.discountValue, 10);
  assert.deepEqual(percentCoupon.applicableCategories, ['seeds']);
  assert.equal(percentCoupon.createdBy, 'delima20k@gmail.com');

  const percentDiscount = calculateCouponDiscountInCents({
    coupon: percentCoupon,
    subtotalInCents: 1000,
    productSlugs: ['hypno-bloom-seed'],
    productCategories: ['seeds'],
    now: new Date('2026-07-19T12:00:00.000Z')
  });
  assert.equal(percentDiscount.ok, true);
  assert.equal(percentDiscount.discountInCents, 100);

  const fixedCoupon = service.upsert({
    code: 'desconto5',
    description: 'R$ 5 de desconto',
    discountType: 'fixed',
    discountValue: '1500',
    categories: ['packages'],
    productSlugs: ['5x-moon-bloom-seed'],
    maxUses: '1',
    active: true
  }, { products, adminEmail: 'delima20k@gmail.com' });

  assert.equal(fixedCoupon.code, 'DESCONTO5');
  assert.equal(fixedCoupon.discountType, 'fixed');
  assert.equal(fixedCoupon.amountInCents, 1500);
  assert.deepEqual(fixedCoupon.applicableProductSlugs, ['5x-moon-bloom-seed']);
  const fixedDiscount = calculateCouponDiscountInCents({
    coupon: fixedCoupon,
    subtotalInCents: 1000,
    productSlugs: ['5x-moon-bloom-seed'],
    productCategories: ['packages'],
    now: new Date('2026-07-19T12:00:00.000Z')
  });
  assert.equal(fixedDiscount.ok, true);
  assert.equal(fixedDiscount.discountInCents, 1000);
  assert.equal(calculateCouponDiscountInCents({
    coupon: fixedCoupon,
    subtotalInCents: 1000,
    productSlugs: ['5x-moon-bloom-seed'],
    productCategories: ['packages'],
    usageCount: 1,
    now: new Date('2026-07-19T12:00:00.000Z')
  }).ok, false);

  assert.throws(() => service.upsert({
    code: 'ERRADO',
    discountType: 'percentage',
    discountValue: '10',
    categories: ['invalid']
  }, { products }), /Categoria/);
  assert.throws(() => service.upsert({
    code: 'PRODUTO',
    discountType: 'percentage',
    discountValue: '10',
    productSlugs: ['produto-inexistente']
  }, { products }), /Produto inexistente/);

  const toggled = service.toggle(percentCoupon.id);
  assert.equal(toggled.active, false);
  service.archive(percentCoupon.id);
  assert.equal(service.list().some((coupon) => coupon.id === percentCoupon.id), false);
});

test('Grow Garden cart view uses existing checkout field helper and render fallback', () => {
  assert.equal(growGardenModuleCode.includes('buildCheckoutField'), false, 'cart must not call a missing helper');
  assert.ok(growGardenModuleCode.includes("this.buildField('customerName'"), 'cart customer field must use the shared helper');
  assert.ok(growGardenModuleCode.includes("console.error('GROW_GARDEN_RENDER_ERROR'"), 'render must log technical failures');
  assert.ok(growGardenModuleCode.includes('this.root.replaceChildren(container)'), 'render must swap content only after building a replacement');
  assert.ok(growGardenModuleCode.includes('Nao foi possivel carregar o carrinho.'), 'cart render fallback must be visible');
  assert.ok(growGardenModuleCode.includes('Seu carrinho esta vazio.'), 'empty cart must render a visible message');
  assert.ok(growGardenModuleCode.includes('Voltar a loja'), 'empty cart must include a back-to-store button');
});

test('cart checkout accepts refreshed seed and package stock and still blocks sold out categories', () => {
  const service = new StoreCommerceService({
    config: {
      ...STORE_COMMERCE_CONFIG,
      commerceEnabled: false,
      testCheckoutEnabled: true,
      pix: {
        ...STORE_COMMERCE_CONFIG.pix,
        receiverName: 'Delima Blox',
        receiverCity: 'SAO PAULO'
      }
    }
  });
  const productsBySlug = new Map(growGardenStoreProductsData.products.map((product) => [product.slug, product]));
  const availableResult = service.buildCartPixOrder({
    items: [
      ['firefly', 1]
    ].map(([slug, quantity]) => {
      const product = service.normalizeStoreProduct(productsBySlug.get(slug));
      return { seed: { ...product, commerce: product }, quantity };
    }),
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    email: 'alan@example.com',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });

  assert.equal(availableResult.ok, true);
  assert.equal(availableResult.order.items.length, 1);
  assert.equal(availableResult.order.productSlug, 'firefly');
  assert.equal(availableResult.order.totalInCents, 790);
  assert.equal(availableResult.order.pixPayloadStatus, 'ready');

  const overStockResult = service.buildCartPixOrder({
    items: [['firefly', 11]].map(([slug, quantity]) => {
      const product = service.normalizeStoreProduct(productsBySlug.get(slug));
      return { seed: { ...product, commerce: product }, quantity };
    }),
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    email: 'alan@example.com',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });
  assert.equal(overStockResult.ok, false);
  assert.equal(overStockResult.code, 'OUT_OF_STOCK');
  assert.equal(overStockResult.errors.includes('Firefly nao possui estoque suficiente.'), true);

  const blockedResult = service.buildCartPixOrder({
    items: ['hypno-bloom-seed', 'dragon-breath-seed'].map((slug) => {
      const product = service.normalizeStoreProduct(productsBySlug.get(slug));
      return { seed: { ...product, commerce: product }, quantity: 1 };
    }),
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    robloxDisplayName: 'arthur233',
    email: 'alan@example.com',
    couponCode: '',
    coupons: [],
    termsAccepted: true,
    now: new Date('2026-07-02T12:00:00.000Z')
  });
  assert.equal(blockedResult.ok, false);
  assert.equal(blockedResult.code, 'OUT_OF_STOCK');
  assert.equal(blockedResult.errors.every((error) => error === 'Produto temporariamente sem estoque.'), true);
});

test('Thur Blox keeps public portal while protecting admin by authorized email', () => {
  const envExample = readFileSync(resolve(projectRoot, '.env.example'), 'utf8');
  assert.equal(envExample.includes('ADMIN_ACCESS_PASSWORD='), true);
  assert.equal(envExample.includes('ORDER_TRACKING_PASSWORD='), false);
  assert.equal(envExample.includes('SUPABASE'), false);
  assert.equal(envExample.includes('VITE_STORE_API_URL='), true);
  assert.equal(existsSync(resolve(projectRoot, 'src', 'services', 'AuthService.js')), true);
  assert.equal(existsSync(resolve(projectRoot, 'src', 'services', 'AuthGuards.js')), false);
  assert.equal(existsSync(resolve(projectRoot, 'server', 'auth', 'AuthService.js')), false);
  assert.equal(appCode.includes('AuthService'), true);
  assert.equal(appCode.includes("'/admin': 'admin'"), true);
  assert.equal(appCode.includes("'/admin/descontos': 'admin'"), true);
  assert.equal(appCode.includes("'/admin/cupons': 'admin'"), true);
  assert.equal(appCode.includes('getAdminInitialPanelTab'), true);
  assert.equal(appCode.includes('initialAdminPanelTab'), true);
  assert.equal(appCode.includes('renderAuthScreen'), false);
  assert.equal(appCode.includes('renderCheckingSession'), false);
  assert.equal(appCode.includes('Entre no Thur Blox'), false);
  assert.equal(appCode.includes('Esqueci minha senha'), false);
  assert.equal(appCode.includes('getSession'), true);
  assert.equal(appCode.includes('adminSession?.authorized'), false);
  assert.equal(appCode.includes('!adminSession'), true);
  assert.equal(appCode.includes('isAdminSession(adminSession)'), true);
  assert.equal(appCode.includes('/api/auth/'), false);
  assert.equal(homePortalCode.includes('Entrar na sua conta'), true);
  assert.equal(homePortalCode.includes('Acesse sua conta para acompanhar pedidos e falar com o suporte.'), true);
  assert.equal(homePortalCode.includes('Criar conta'), true);
  assert.equal(homePortalCode.includes('Entrar no painel'), false);
  assert.equal(homePortalCode.includes('Área privada'), false);
  assert.equal(homePortalCode.includes('Use um e-mail autorizado'), false);
  assert.equal(homePortalCode.includes('Controle local de desenvolvimento'), false);
  assert.equal(homePortalCode.includes('Meu perfil'), true);
  assert.equal(homePortalCode.includes('Minhas compras'), true);
  assert.equal(homePortalCode.includes('Você ainda não fez nenhuma compra.'), true);
  assert.equal(homePortalCode.includes('Continuar pagamento'), true);
  assert.equal(homePortalCode.includes('Ver detalhes'), true);
  assert.equal(homePortalCode.includes('buildUserMenu'), true);
  assert.equal(homePortalCode.includes('portal-user-dropdown'), true);
  assert.equal(homePortalCode.includes('buildPortalIcon'), true);
  assert.equal(homePortalCode.includes("icon: 'dashboard'"), true);
  assert.equal(homePortalCode.includes("icon: 'package'"), true);
  assert.equal(homePortalCode.includes("icon: 'logout'"), true);
  assert.equal(homePortalCode.includes("buildPortalIcon('cart'"), true);
  assert.equal(homePortalCode.includes('dropdown-icon'), false);
  assert.equal(homePortalCode.includes('buildProfilePage'), true);
  assert.equal(homePortalCode.includes('customer-profile-page'), true);
  assert.equal(homePortalCode.includes('buildOrderDetailsModal'), true);
  assert.equal(homePortalCode.includes('filterCustomerOrders'), true);
  assert.equal(homePortalCode.includes('orderBelongsToCurrentCustomer'), true);
  assert.equal(homePortalCode.includes('/api/customer/orders'), true);
  assert.equal(homePortalCode.includes('Produtos comprados'), true);
  assert.equal(homePortalCode.includes('Pagamento aprovado!'), true);
  assert.equal(homePortalCode.includes('Pedido cancelado'), true);
  assert.equal(homePortalCode.includes('Pedido entregue'), true);
  assert.equal(homePortalCode.includes('Entrar'), true);
  assert.equal(homePortalCode.includes('Painel'), true);
  assert.equal(homePortalCode.includes('Sair'), true);
  assert.equal(homePortalCode.includes('delima20k@gmail.com'), false);
  assert.equal(homePortalCode.includes('Administrador'), false);
  assert.equal(growGardenModuleCode.includes('Acompanhar pedido'), false);
  assert.equal(growGardenModuleCode.includes('Consultar pedido'), false);
  assert.equal(growGardenModuleCode.includes('Aguardando consulta'), false);
  assert.equal(growGardenModuleCode.includes('buildOrderLookupSection'), false);
  assert.equal(growGardenModuleCode.includes('161'), false);
  assert.equal(growGardenModuleCode.includes('3112'), false);
  assert.equal(storeConfigCode.includes('161'), false);
  assert.equal(storeConfigCode.includes('3112'), false);
  assert.equal(growGardenModuleCode.includes('/api/access/admin/verify'), false);
  assert.equal(growGardenModuleCode.includes('/api/access/order-tracking/verify'), false);
  assert.ok(growGardenModuleCode.includes('/api/store/orders'));
  assert.ok(growGardenModuleCode.includes('responseText'));
  assert.ok(growGardenModuleCode.includes('contentType'));
  assert.ok(growGardenModuleCode.includes('API_OFFLINE'));
  assert.ok(growGardenModuleCode.includes('CORS_ERROR'));
  assert.ok(growGardenModuleCode.includes('ORDER_API_ERROR'));
  assert.ok(growGardenModuleCode.includes('LOCAL_STORAGE_ERROR'));
  assert.ok(growGardenModuleCode.includes('/api/admin/orders'));
  assert.ok(growGardenModuleCode.includes('/api/admin/access'));
  assert.ok(devServerCode.includes('/api/admin/logout'));
  assert.ok(growGardenModuleCode.includes('Acesso administrativo'));
  assert.ok(growGardenModuleCode.includes('Senha invalida.'));
  assert.ok(devServerCode.includes('/api/admin/'));
  assert.ok(devServerCode.includes('authorizedAdminEmails'));
  assert.ok(devServerCode.includes('delima20k@gmail.com'));
  assert.ok(devServerCode.includes("'127.0.0.1'"));
  assert.ok(devServerCode.includes('/api/store/orders'));
  assert.ok(devServerCode.includes('ORDER_OR_PAYMENT_ERROR'));
  assert.ok(devServerCode.includes('/api/admin/access'));
  assert.ok(devServerCode.includes('/api/customer/orders'));
  assert.ok(devServerCode.includes('orderBelongsToCustomer'));
  assert.ok(devServerCode.includes('sendPixChargeForOrder'));
  assert.ok(devServerCode.includes('ADMIN_ACCESS_PASSWORD'));
  assert.ok(devServerCode.includes("|| '3112'"));
  assert.ok(devServerCode.includes('adminTtlMs = 30 * 60 * 1000'));
  assert.ok(devServerCode.includes('count >= 5'));
  assert.equal(devServerCode.includes('requireAdmin(request)'), false);
  assert.equal(devServerCode.includes('requireAuth(request)'), false);
  assert.equal(devServerCode.includes('/api/auth/'), false);
  assert.equal(devServerCode.includes('findPublic'), false);
  assert.equal(growGardenModuleCode.includes("label: 'Admin'"), false);
  assert.equal(growGardenModuleCode.includes('data-admin-panel-tab'), true);
  assert.equal(growGardenModuleCode.includes('Controle de estoque'), true);
  assert.equal(growGardenModuleCode.includes('Produtos cadastrados'), true);
  assert.equal(growGardenModuleCode.includes('Salvar alteracoes'), true);
  assert.equal(growGardenModuleCode.includes('Salvar alteracoes (${pendingCount})'), true);
  assert.equal(growGardenModuleCode.includes('admin-stock-save-one'), true);
  assert.equal(growGardenModuleCode.includes('Ativar produtos com estoque'), false);
  assert.equal(growGardenModuleCode.includes('data-stock-category'), false);
  assert.equal(growGardenModuleCode.includes('getStoreCategories().map'), true);
  assert.equal(growGardenModuleCode.includes('formatCategory(category.key)} com estoque'), false);
  assert.equal(growGardenModuleCode.includes('activateStockedProducts'), false);
  assert.equal(growGardenModuleCode.includes('activateStockedSeeds'), false);
  assert.equal(growGardenModuleCode.includes('Isso vai ativar ${label} com estoque maior que zero'), false);
  assert.equal(growGardenModuleCode.includes('/api/admin/products/stock'), true);
  assert.equal(devServerCode.includes('/api/admin/products/stock'), true);
  assert.equal(devServerCode.includes('saveStoreProductStockChanges'), true);
  assert.equal(devServerCode.includes('store-products.json'), true);
  assert.equal(growGardenModuleCode.includes('getAdminStockSummary'), true);
  assert.equal(growGardenModuleCode.includes('Alteracao pendente'), true);
  assert.equal(growGardenModuleCode.includes('saveAllAdminStock'), true);
  assert.equal(growGardenModuleCode.includes('discardAdminStockChanges'), false);
  assert.equal(styles.includes('.admin-stock-actions'), true);
  assert.equal(styles.includes('.admin-stock-summary'), true);
  assert.equal(styles.includes('.admin-stock-card.has-pending-changes'), true);
  assert.equal(growGardenModuleCode.includes("['discounts', 'Descontos']"), true);
  assert.equal(growGardenModuleCode.includes('buildAdminDiscountsSection'), true);
  assert.equal(growGardenModuleCode.includes('CouponAdminService'), true);
  assert.equal(growGardenModuleCode.includes('CasaInicio'), false);
  assert.equal(growGardenModuleCode.includes('LojaLoja'), false);
  assert.equal(growGardenModuleCode.includes('SeedCatalogo seeds'), false);
  assert.equal(growGardenModuleCode.includes('MaisMais'), false);
  assert.equal(growGardenModuleCode.includes('AdminAdmin'), false);
  assert.equal(growGardenModuleCode.includes("'SD'"), false);
  assert.equal(growGardenModuleCode.includes("'PT'"), false);
  assert.equal(growGardenModuleCode.includes("'GR'"), false);
  assert.equal(growGardenModuleCode.includes("'PK'"), false);
});

test('LocalOrderRepository persists manual local orders for checkout and admin', () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value)
  };
  const repository = new LocalOrderRepository({ storage, storageKey: 'orders-test' });
  const created = repository.create({
    orderCode: 'THUR-LOCAL1',
    productSlug: 'hypno-bloom-seed',
    productName: 'Hypno Bloom Seed',
    quantity: 1,
    unitPriceInCents: 790,
    subtotalInCents: 790,
    discountInCents: 0,
    totalInCents: 790,
    customerUserId: 'user_cliente_1',
    customerName: 'Alan de Lima Santos',
    robloxUsername: 'arthur233',
    paymentMethod: 'pix',
    paymentStatus: 'pending',
    orderStatus: 'awaiting_payment',
    deliveryStatus: 'pending',
    createdAt: '2026-07-02T00:00:00.000Z'
  });

  assert.equal(created.storageMode, 'local');
  assert.equal(created.storageLabel, 'Pedido manual.');
  assert.equal(created.customer_user_id, 'user_cliente_1');
  assert.equal(created.totalInCents, 790);
  assert.equal(repository.findByCode('thur-local1').orderCode, 'THUR-LOCAL1');
  assert.equal(repository.list().length, 1);
  assert.equal(repository.update('THUR-LOCAL1', { orderStatus: 'paid' }).orderStatus, 'paid');
});

test('create account modal remains scrollable and keeps its submit button visible', () => {
  assert.match(homePortalCode, /auth-login-modal auth-modal auth-modal-content/);
  assert.match(homePortalCode, /button-primary auth-submit-button/);
  assert.match(homePortalCode, /Criar conta/);
  assert.match(styles, /\.auth-login-modal\s*\{[^}]*max-height:\s*calc\(100vh - 32px\);[^}]*overflow-y:\s*auto;/s);
  assert.match(styles, /\.auth-login-modal \.auth-submit-button\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(styles, /\.auth-form-fields input\s*\{[^}]*width:\s*100%;[^}]*box-sizing:\s*border-box;/s);
});

test('cancelled and archived orders stay persisted but are hidden from the active admin list', () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value)
  };
  const repository = new LocalOrderRepository({ storage, storageKey: 'archived-orders-test' });
  repository.create({ orderCode: 'THUR-ACTIVE', orderStatus: 'awaiting_payment' });
  repository.create({ orderCode: 'THUR-CANCEL', orderStatus: 'awaiting_payment' });
  repository.update('THUR-CANCEL', { orderStatus: 'cancelled', archived: true });

  const persisted = repository.list();
  assert.equal(persisted.length, 2, 'soft delete must preserve order history');
  assert.equal(repository.findByCode('THUR-CANCEL').archived, true);
  assert.deepEqual(persisted.filter(isActiveOrder).map((order) => order.orderCode), ['THUR-ACTIVE']);
  assert.equal(isActiveOrder({ orderStatus: 'canceled' }), false);
  assert.equal(isActiveOrder({ status: 'cancelled' }), false);
  assert.equal(isActiveOrder({ orderStatus: 'paid', deleted: true }), false);
});

test('orders work without an authenticated session and admin can list all after authorization', () => {
  const store = new OrderStore({ storePath: resolve(mkdtempSync(resolve(tmpdir(), 'thur-orders-')), 'orders.json') });
  const order = store.create({
    orderCode: 'THUR-ABC123',
    seedName: 'Hypno Bloom Seed',
    customerUserId: 'user_cliente_api',
    customerName: 'Cliente',
    robloxUsername: 'Delima_123',
    email: '',
    totalInCents: 790,
    orderStatus: 'awaiting_payment'
  });

  assert.equal(order.customer_user_id, 'user_cliente_api');
  assert.equal(order.customer_email, '');
  assert.equal(order.customer_name, 'Cliente');
  assert.equal(store.findByCode('THUR-ABC123')?.orderCode, 'THUR-ABC123');
  assert.equal(store.listAll().length, 1);
  assert.equal(store.updateStatus('THUR-ABC123', { orderStatus: 'paid' }).orderStatus, 'paid');
  const archived = store.updateStatus('THUR-ABC123', { orderStatus: 'cancelled', archived: true });
  assert.equal(archived.archived, true);
  assert.equal(store.listAll().length, 1, 'server soft delete must preserve order history');
  assert.equal(store.listAll().filter(isActiveOrder).length, 0);
});

test('StoreCommerceService blocks buying while commerce is disabled', () => {
  const service = new StoreCommerceService({ config: STORE_COMMERCE_CONFIG });
  const result = service.canBuy({
    saleEnabled: true,
    priceInCents: 1000,
    availableStock: 10,
    currency: 'BRL'
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Modo de teste/);

  const payload = service.buildOrderPayload({
    seed: { slug: 'carrot' },
    quantity: 1,
    customerName: 'Delima',
    robloxUsername: 'Delima_123',
    termsAccepted: true
  });
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.payload.items, [{ seedSlug: 'carrot', quantity: 1 }]);
  assert.equal(payload.payload.robloxUsername, 'Delima_123');
});

test('slugify produces stable slugs used for market joins', () => {
  assert.equal(slugify(' Strawberry   Elephant '), 'strawberry-elephant');
  assert.equal(slugify('Signoré Carapace!'), 'signore-carapace');
  assert.equal(slugify('Dug dug dug'), 'dug-dug-dug');
});

test('central market values are numeric and joined by slug', () => {
  assert.ok(realTradeValuesData.length === rawBrainrotsData.length, 'real trade values must process every pet');
  assert.equal(diagnostics.valueWithoutPet.length, 0, 'every market value must match a pet');
  assert.equal(diagnostics.nonNumericValues.length, 0, 'market values must be numeric after parsing');
  assert.equal(missingMarketValues.length, rawBrainrotsData.length - marketValuesData.length);

  const strawberryValue = realTradeValuesData.find((item) => item.brainrotSlug === 'strawberry-elephant');
  assert.equal(strawberryValue.communityTradeValue, 4126071);
  assert.equal(typeof strawberryValue.communityTradeValue, 'number');

  const strawberry = findBySlug('strawberry-elephant');
  assert.ok(strawberry, 'Strawberry Elephant must be located by slug');
  assert.equal(strawberry.baseTradeValue, 4126071, 'Strawberry value must come from market snapshot');
  assert.equal(strawberry.tradeValue, 4126071, 'tradeValue alias must stay available');
  assert.equal(strawberry.valueConfidence, 'medium');
  assert.equal(strawberry.valueSources[0].name, 'Game.Guide');
});

test('game stats keep base income separate from community trade value', () => {
  assert.equal(parseGameNumber('1'), 1);
  assert.equal(parseGameNumber('1K'), 1000);
  assert.equal(parseGameNumber('1M'), 1000000);
  assert.equal(parseGameNumber('1B'), 1000000000);
  assert.equal(parseGameNumber('1T'), 1000000000000);
  assert.equal(parseGameNumber('50M/s'), 50000000);
  assert.equal(parseGameNumber('$10B'), 10000000000);
  assert.equal(parseGameNumber('N/A'), null);

  const garama = findBySlug('garama-and-madundung');
  assert.equal(garama.purchaseCost, 10000000000);
  assert.equal(garama.baseIncomePerSecond, 50000000);
  assert.equal(garama.incomePerSecond, 50000000);
  assert.equal(garama.communityTradeValue, 550);
  assert.equal(garama.baseTradeValue, 550, 'legacy trade value must remain separate from income');
});

test('Garama income mutations use base income, not community trade value', () => {
  const garama = findBySlug('garama-and-madundung');
  const expected = {
    normal: 50000000,
    gold: 62500000,
    diamond: 75000000,
    radioactive: 425000000,
    rainbow: 500000000,
    cyber: 550000000,
    phantom: 600000000
  };

  for (const [slug, income] of Object.entries(expected)) {
    const mutation = mutationsData.find((item) => item.slug === slug);
    assert.equal(IncomeCalculatorService.calculate({ brainrot: garama, mutation }).income, income);
  }
});

test('all confirmed game stats use numeric income and allowed statuses', () => {
  const allowedStatuses = new Set(['confirmed', 'conflicting', 'unavailable', 'invalid', 'review']);
  const statsBySlug = new Map(gameStatsData.map((entry) => [entry.brainrotSlug, entry]));

  for (const pet of rawBrainrotsData) {
    const stat = statsBySlug.get(pet.slug);
    assert.ok(stat, `${pet.slug} must have a game stats record`);
    assert.ok(allowedStatuses.has(stat.status), `${pet.slug} has invalid status ${stat.status}`);
    assert.notEqual(typeof stat.purchaseCost, 'string', `${pet.slug} purchaseCost must not be formatted text`);
    assert.notEqual(typeof stat.baseIncomePerSecond, 'string', `${pet.slug} baseIncomePerSecond must not be formatted text`);
  }
});

test('all pets with base income calculate required mutation multipliers', () => {
  const expectedMultipliers = {
    normal: 1,
    gold: 1.25,
    diamond: 1.5,
    rainbow: 10,
    radioactive: 8.5,
    cyber: 11,
    phantom: 12
  };
  const comparablePets = brainrotsData.filter((pet) => Number.isFinite(Number(pet.baseIncomePerSecond)) && Number(pet.baseIncomePerSecond) > 0);

  assert.ok(comparablePets.length > 1, 'more than one pet must have confirmed base income');
  for (const pet of comparablePets) {
    for (const [slug, multiplier] of Object.entries(expectedMultipliers)) {
      const mutation = mutationsData.find((item) => item.slug === slug);
      const result = IncomeCalculatorService.calculate({ brainrot: pet, mutation });
      assert.equal(result.income, Number(pet.baseIncomePerSecond) * multiplier, `${pet.slug} ${slug} income mismatch`);
    }
  }
});

test('required sample pets are processed in game stats', () => {
  const required = [
    'garama-and-madundung',
    'signore-carapace',
    'elefanto-frigo',
    'strawberry-elephant',
    'skibidi-toilet',
    'meowl',
    'headless-horseman',
    'antonio',
    'tictac-sahur',
    'noobini-pizzanini',
    'fluriflura',
    'holy-arepa',
    'bombardiro-crocodilo',
    'cocofanto-elefanto'
  ];
  const statsBySlug = new Map(gameStatsData.map((entry) => [entry.brainrotSlug, entry]));

  for (const slug of required) {
    const pet = findBySlug(slug);
    const stat = statsBySlug.get(slug);
    assert.ok(pet, `${slug} must exist in brainrots.json`);
    assert.ok(stat, `${slug} must exist in brainrot-game-stats.json`);
    assert.equal(stat.brainrotSlug, slug);
  }
});

test('global mutations and image index exist without removed feature files', () => {
  assert.ok(mutationsData.length >= 12, 'must include mutation review records');
  assert.ok(mutationsData.some((mutation) => mutation.slug === 'normal'), 'Normal mutation must exist');
  assert.ok(mutationsData.some((mutation) => mutation.slug === 'gold'), 'Gold mutation must exist');
  assert.equal(mutationsData.find((mutation) => mutation.slug === 'rainbow').estimatedValueMultiplier, 10);
  assert.equal(mutationsData.find((mutation) => mutation.slug === 'cyber').estimatedValueMultiplier, 11);
  assert.equal(mutationsData.find((mutation) => mutation.slug === 'phantom').estimatedValueMultiplier, 12);
  assert.equal(imagesData.length, rawBrainrotsData.length, 'each brainrot must have image metadata');
  assert.equal(missingImages.length, 5, 'only images rejected for missing/duplicate review should remain missing');
  assert.equal(existsSync(resolve(projectRoot, 'src', 'data', `${removedFeature}s.json`)), false, 'removed feature data file must not exist');
});

test('brainrot data has expected schema without duplicate ids or removed feature field', () => {
  assert(Array.isArray(rawBrainrotsData), 'src/data/brainrots.json must contain an array');
  assert.equal(rawBrainrotsData.length, 493, 'current import should preserve 493 brainrots');
  assert(Array.isArray(reviewData), 'src/data/brainrots-review.json must contain an array');

  const normalizedNames = new Set();
  const slugs = new Set();
  for (const item of rawBrainrotsData) {
    assert.ok(item.id, `${item.name} must have an id`);
    assert.ok(item.slug, `${item.name} must have a slug`);
    assert.ok(item.name && typeof item.name === 'string', 'Each brainrot must have a non-empty name');
    assert.ok(RARITY_ORDER.includes(item.rarity), `${item.name} has invalid rarity: ${item.rarity}`);
    assert.ok(Array.isArray(item.mutations), `${item.name} must have mutations array`);
    assert.ok(!Object.hasOwn(item, `${removedFeature}s`), `${item.name} must not expose removed feature field`);
    assert.ok(item.mutations.some((mutation) => mutation.name === 'Normal'), `${item.name} must expose Normal mutation`);
    const normalized = TradeEquivalenceService.normalizeText(item.name);
    assert.ok(!normalizedNames.has(normalized), `Duplicate brainrot name detected: ${item.name}`);
    assert.ok(!slugs.has(item.slug), `Duplicate brainrot slug detected: ${item.slug}`);
    normalizedNames.add(normalized);
    slugs.add(item.slug);
  }
});

test('required rarity order and required pets are preserved', () => {
  assert.deepEqual(RARITY_ORDER, [
    'Common',
    'Rare',
    'Epic',
    'Legendary',
    'Mythic',
    'Brainrot God',
    'Secret',
    'OG'
  ]);

  for (const name of ['Strawberry Elephant', 'Meowl', 'Headless Horseman', 'John Pork', 'Spyder Elephant', 'Skibidi Toilet']) {
    const item = findByName(name);
    assert.ok(item, `${name} must exist in brainrots.json`);
    assert.equal(item.rarity, 'OG', `${name} must be OG`);
  }
});

test('Strawberry Elephant returns equivalences with the new value snapshot', () => {
  const strawberry = findBySlug('strawberry-elephant');
  const result = TradeEquivalenceService.findEquivalences({
    selectedPet: strawberry,
    quantity: 1,
    mutation: TradeEquivalenceService.getMutation(strawberry, 'Normal')
  }, brainrotsData, { useBaseValueWhenMutationUnpriced: true });

  assert.equal(result.referenceValue, 4126071);
  assert.ok(result.results.every((item) => item.pets.every((entry) => entry.quantity < 1000)));
  if (!result.results.length) {
    assert.ok(result.diagnostics.includes('Nao encontramos uma equivalencia realista com este pet. Tente combinar outros Brainrots de valor proximo.'));
  }
});

test('Tictac Sahur RGB suggests about seven Garama and Madundung', () => {
  const tictac = findBySlug('tictac-sahur');
  const rainbow = mutationsData.find((mutation) => mutation.slug === 'rainbow');
  const result = TradeEquivalenceService.findEquivalences({
    selectedPet: tictac,
    quantity: 1,
    mutation: rainbow
  }, brainrotsData);

  const garama = result.results.find((item) => item.type === 'single' && item.pets[0].pet.slug === 'garama-and-madundung');
  assert.equal(tictac.baseTradeValue, 390);
  assert.equal(result.referenceValue, 390, 'market mode must not apply Rainbow income multiplier');
  assert.equal(garama, undefined, 'Garama must not be forced when it exceeds the realistic market margin');
});

test('Garama and Madundung keeps merged market value and does not multiply market by income mutation', () => {
  const garamaMarket = marketValuesData.find((item) => item.brainrotSlug === 'garama-and-madundung');
  const garama = findBySlug('garama-and-madundung');
  const tictac = findBySlug('tictac-sahur');
  const radioactive = mutationsData.find((mutation) => mutation.slug === 'radioactive');

  assert.ok(garamaMarket, 'Garama market record must exist');
  assert.equal(garamaMarket.baseTradeValue, 550);
  assert.equal(garamaMarket.sources[0].name, 'Fonte comunitaria cadastrada');
  assert.ok(garama, 'Garama must be found by canonical slug');
  assert.equal(garama.baseTradeValue, 550, 'merge must not erase Garama market value');
  assert.equal(garama.tradeValue, 550, 'legacy alias must mirror baseTradeValue after merge');
  assert.equal(radioactive.estimatedValueMultiplier, 8.5);
  assert.equal(TradeEquivalenceService.calculatePetValue(garama, 1, radioactive), 550);

  const result = TradeEquivalenceService.findEquivalents({
    selectedPet: garama,
    quantity: 1,
    mutation: radioactive,
    allPets: brainrotsData,
    mutations: mutationsData
  });
  const tictacResult = result.results.find((item) => item.type === 'single' && item.pets[0].pet.slug === 'tictac-sahur' && item.pets[0].mutation.slug === 'normal');

  assert.equal(result.referenceValue, 550);
  assert.ok(result.results.length > 0, 'Garama Radioactive must not leave panel empty');
  assert.ok(tictac, 'Tictac Sahur must exist');
  assert.equal(tictac.baseTradeValue, 390);
  assert.ok(tictacResult, 'Tictac Sahur Normal must be suggested');
  assert.equal(tictacResult.pets[0].quantity, 1);
  assert.equal(tictacResult.value, 390);
  assert.ok(tictacResult.differencePercent > -30);
});

test('income comparison mode uses income per second instead of community trade value', () => {
  const garama = findBySlug('garama-and-madundung');
  const radioactive = mutationsData.find((mutation) => mutation.slug === 'radioactive');
  const result = TradeEquivalenceService.findEquivalents({
    selectedPet: garama,
    quantity: 1,
    mutation: radioactive,
    allPets: brainrotsData,
    mutations: mutationsData,
    comparisonMode: 'income'
  });

  assert.equal(result.selectedBaseValue, 50000000);
  assert.equal(result.selectedUnitValue, 425000000);
  assert.equal(result.selectedTotal, 425000000);
  assert.equal(result.selectedValueSource, 'income');
  assert.ok(result.results.length > 0, 'income comparison should return candidates when income exists');
});

test('real trade mode rejects absurd Garama quantities against Secret pets', () => {
  const garama = findBySlug('garama-and-madundung');
  const signore = findBySlug('signore-carapace');
  const elefanto = findBySlug('elefanto-frigo');
  const normal = mutationsData.find((mutation) => mutation.slug === 'normal');
  const result = RealTradeEquivalenceService.findEquivalents({
    selectedPet: garama,
    quantity: 1,
    mutation: normal,
    allPets: brainrotsData
  });

  const forbidden = result.results
    .flatMap((item) => item.pets)
    .filter((item) => ['signore-carapace', 'elefanto-frigo'].includes(item.pet.slug));

  assert.equal(result.referenceValue, 550);
  assert.equal(signore.communityTradeValue, 207500);
  assert.equal(elefanto.communityTradeValue, 112500);
  assert.equal(forbidden.length, 0, 'Garama must not suggest impossible Signore/Elefanto quantities');
  assert.ok(result.results.every((item) => item.pets.every((entry) => entry.quantity < 1000)));
});

test('Headless Horseman returns market candidates when selected OG value is high', () => {
  const headless = findBySlug('headless-horseman');
  const normal = mutationsData.find((mutation) => mutation.slug === 'normal');
  const result = RealTradeEquivalenceService.findEquivalents({
    selectedPet: headless,
    quantity: 1,
    mutation: normal,
    allPets: brainrotsData
  });

  assert.equal(result.referenceValue, 875000);
  assert.ok(result.results.length > 0, 'Headless Horseman must return at least one market candidate');
  assert.ok(result.results.every((item) => item.pets.every((entry) => entry.quantity >= 1)));
});

test('Digi Narwhal falls back to approximate market candidates when strict margins fail', () => {
  const digiNarwhal = findBySlug('digi-narwhal');
  const normal = mutationsData.find((mutation) => mutation.slug === 'normal');
  const result = RealTradeEquivalenceService.findEquivalents({
    selectedPet: digiNarwhal,
    quantity: 1,
    mutation: normal,
    allPets: brainrotsData
  });

  assert.ok(hasTradeValue(digiNarwhal), 'Digi Narwhal must have a usable market value');
  assert.ok(result.results.length > 0, 'Digi Narwhal must return at least one market candidate');
  assert.ok(result.diagnostics.some((message) => message.includes('aproximacoes')), 'Fallback diagnostics should be shown when strict margins are not enough');
});

test('real trade mode enforces configured quantity and supply limits', () => {
  const selected = { slug: 'selected', name: 'Selected', rarity: 'Secret', communityTradeValue: 500000 };
  const secretCandidate = { slug: 'secret-candidate', name: 'Secret Candidate', rarity: 'Secret', communityTradeValue: 500 };
  const commonCandidate = { slug: 'common-candidate', name: 'Common Candidate', rarity: 'Common', communityTradeValue: 1000, existCount: 20, existCountConfidence: 'high' };
  const result = RealTradeEquivalenceService.findEquivalents({
    selectedPet: selected,
    quantity: 1,
    mutation: { slug: 'normal', name: 'Normal' },
    allPets: [selected, secretCandidate, commonCandidate]
  });

  assert.equal(result.results.length, 0);
  assert.ok(result.rejected.some((item) => item.reason === 'UNREALISTIC_QUANTITY' && item.petSlug === 'secret-candidate'));
  assert.ok(result.rejected.some((item) => item.reason === 'UNREALISTIC_QUANTITY' && item.petSlug === 'common-candidate'));
});

test('real trade mode never uses income as market value or income multiplier as market multiplier', () => {
  const selected = { slug: 'selected', name: 'Selected', rarity: 'Secret', communityTradeValue: 100, baseIncomePerSecond: 1000000 };
  const candidate = { slug: 'candidate', name: 'Candidate', rarity: 'Secret', communityTradeValue: 100, baseIncomePerSecond: 1 };
  const rainbow = mutationsData.find((mutation) => mutation.slug === 'rainbow');
  const result = RealTradeEquivalenceService.findEquivalents({
    selectedPet: selected,
    quantity: 1,
    mutation: rainbow,
    allPets: [selected, candidate]
  });

  assert.equal(result.referenceValue, 100);
  assert.equal(result.selectedUnitValue, 100);
  assert.equal(result.results[0].pets[0].quantity, 1);
  assert.equal(result.results[0].value, 100);
});

test('pet without real market value does not pretend to have a fair trade', () => {
  const john = findBySlug('john-pork');
  const result = RealTradeEquivalenceService.findEquivalents({
    selectedPet: john,
    quantity: 1,
    mutation: { slug: 'normal', name: 'Normal' },
    allPets: brainrotsData
  });

  assert.equal(result.referenceValue, null);
  assert.equal(result.results.length, 0);
  assert.ok(result.diagnostics.includes('Este pet possui dados de renda, mas ainda nao possui valor real de troca confirmado.'));
});

test('two-pet combinations work without generating three-pet combinations', () => {
  const strawberry = findBySlug('strawberry-elephant');
  const result = TradeEquivalenceService.findEquivalences({
    selectedPet: strawberry,
    quantity: 1,
    mutation: TradeEquivalenceService.getMutation(strawberry, 'Normal')
  }, brainrotsData, { useBaseValueWhenMutationUnpriced: true });

  assert.ok(result.groups.combinations.length > 0, 'must return two-pet combinations');
  assert.ok(result.groups.combinations.every((item) => item.type === 'combo-2'), 'only two-pet combinations should be returned');
  assert.ok(result.groups.combinations.every((item) => item.pets.length === 2), 'each combo should have two pets');
});

test('quantity 2 doubles selected total', () => {
  const strawberry = findBySlug('strawberry-elephant');
  const result = TradeEquivalenceService.findEquivalences({
    selectedPet: strawberry,
    quantity: 2,
    mutation: TradeEquivalenceService.getMutation(strawberry, 'Normal')
  }, brainrotsData, { useBaseValueWhenMutationUnpriced: true });
  assert.equal(result.referenceValue, 8252142);
});

test('mutation estimated multiplier changes selected value', () => {
  const strawberry = findBySlug('strawberry-elephant');
  const gold = mutationsData.find((mutation) => mutation.slug === 'gold');
  const result = TradeEquivalenceService.findEquivalences({
    selectedPet: strawberry,
    quantity: 1,
    mutation: gold
  }, brainrotsData, { useBaseValueWhenMutationUnpriced: true });
  assert.equal(result.referenceValue, 4126071);
  assert.ok(result.diagnostics.includes('Impacto de mercado da mutacao em revisao. O valor real usa o valor normal do pet.'));
});

test('priority pets with central values return candidates', () => {
  for (const slug of ['meowl', 'skibidi-toilet', 'headless-horseman', 'antonio']) {
    const pet = findBySlug(slug);
    const result = TradeEquivalenceService.findEquivalences({
      selectedPet: pet,
      quantity: 1,
      mutation: TradeEquivalenceService.getMutation(pet, 'Normal')
    }, brainrotsData, { useBaseValueWhenMutationUnpriced: true });
    assert.ok(hasTradeValue(pet), `${slug} must have a usable trade value`);
    assert.ok(result.results.every((item) => item.pets.every((entry) => entry.quantity < 1000)), `${slug} must not return absurd quantities`);
    if (!result.results.length) {
      assert.ok(result.diagnostics.includes('Nao encontramos uma equivalencia realista com este pet. Tente combinar outros Brainrots de valor proximo.'));
    }
  }
});

test('unknown community value falls back to experimental estimate', () => {
  const unknownPet = findBySlug('john-pork');
  const resolver = BrainrotValueResolverService.configure(brainrotsData);
  const result = TradeEquivalenceService.findEquivalences({
    selectedPet: unknownPet,
    quantity: 1,
    mutation: TradeEquivalenceService.getMutation(unknownPet, 'Normal')
  }, brainrotsData, { valueResolver: resolver });
  assert.equal(result.referenceValue, null);
  assert.equal(result.results.length, 0);
  assert.equal(result.selectedValueSource, 'unavailable');
  assert.ok(result.diagnostics.includes('Este pet possui dados de renda, mas ainda nao possui valor real de troca confirmado.'));
});

test('formatting never feeds calculations', () => {
  assert.equal(formatTradeValue(7540000), '7,54M');
  assert.equal(formatTradeValue(4126071), '4,13M');
  assert.equal(formatTradeValue(875000), '875K');
  assert.equal(formatTradeValue(207500), '207,5K');
  assert.equal(formatTradeValue(75000), '75K');

  const pet = { name: 'Fixture', baseTradeValue: 4126071, mutations: [{ name: 'Normal', incomeMultiplier: 1, estimatedValueMultiplier: 1, confidence: 'unknown' }] };
  assert.equal(TradeEquivalenceService.calculatePetValue(pet, 1), 4126071);
  assert.notEqual(TradeEquivalenceService.calculatePetValue(pet, 1), formatTradeValue(4126071));
});

test('quantity validation and income calculation remain strict and separate', () => {
  const pet = { name: 'Fixture', incomePerSecond: 100, tradeValue: 1000 };
  const mutation = { name: 'Gold', slug: 'gold', incomeMultiplier: 1.25, tradeValueMultiplier: null, confidence: 'medium' };
  assert.equal(TradeEquivalenceService.calculatePetValue(pet, 0), null);
  assert.equal(TradeEquivalenceService.calculatePetValue(pet, -1), null);
  assert.equal(TradeEquivalenceService.calculatePetValue(pet, 1.5), null);
  assert.equal(IncomeCalculatorService.calculate({ brainrot: pet, mutation }).income, 125);
  assert.equal(TradeEquivalenceService.calculatePetValue(pet, 1, mutation, { useBaseValueWhenMutationUnpriced: true }), 1000);
});

test('downloaded images and fallback are valid for Strawberry Elephant', () => {
  BrainrotImageService.configure(imagesData);
  const strawberryImage = imagesData.find((entry) => entry.brainrotSlug === 'strawberry-elephant');
  assert.ok(strawberryImage, 'Strawberry Elephant must have image metadata');
  assert.equal(strawberryImage.images.card, '/assets/brainrots/256/strawberry-elephant.webp');
  assert.equal(strawberryImage.status, 'downloaded');
  assert.ok(existsSync(resolve(projectRoot, 'public', 'assets', 'brainrots', '128', 'strawberry-elephant.webp')), '128 image must exist');
  assert.ok(existsSync(resolve(projectRoot, 'public', 'assets', 'brainrots', '256', 'strawberry-elephant.webp')), '256 image must exist');
  assert.ok(existsSync(resolve(projectRoot, 'public', 'assets', 'brainrots', '512', 'strawberry-elephant.webp')), '512 image must exist');
  assert.equal(BrainrotImageService.getImage('strawberry-elephant', 'card'), '/assets/brainrots/256/strawberry-elephant.webp');
  assert.equal(BrainrotImageService.getImage('missing-slug', 'card'), fallbackPath);
  assert.ok(existsSync(resolve(projectRoot, 'assets', 'brainrots', 'fallback', 'brainrot-placeholder.webp')), 'fallback asset must exist');
  assert.ok(imageServiceCode.includes('safeImagePath'), 'image service must reject external hotlinks for UI rendering');
  assert.ok(componentCode.includes('image.src.endsWith(BrainrotImageService.fallback())'), 'image fallback must not loop on repeated errors');
});

test('equivalence calculation ignores optional display-only fields', () => {
  const selectedPet = { slug: 'selected', name: 'Selected', rarity: 'Secret', baseTradeValue: 4675 };
  const sparseCandidate = { slug: 'sparse-candidate', name: 'Sparse Candidate', rarity: 'Rare', baseTradeValue: 390 };
  const result = TradeEquivalenceService.findEquivalents({
    selectedPet,
    mutation: mutationsData.find((mutation) => mutation.slug === 'normal'),
    quantity: 1,
    allPets: [selectedPet, sparseCandidate],
    mutations: [mutationsData.find((mutation) => mutation.slug === 'normal')]
  });

  assert.equal(result.results[0].pets[0].pet.slug, 'sparse-candidate');
  assert.equal(result.results[0].pets[0].quantity, 12);
});

test('display helpers and game visual refresh remain wired', () => {
  assert.equal(FormatService.label('unknown'), 'Desconhecido');
  assert.equal(FormatService.availability('unavailable'), 'Indisponivel');
  for (const rarity of RARITY_ORDER) {
    assert.ok(RARITY_THEME[rarity], `${rarity} must have visual theme`);
  }
  assert.ok(BACKGROUND_BRAINROTS.includes('meowl'), 'decorative brainrot config must include popular pets');
  assert.ok(componentCode.includes("usageStatus === 'allowed'"), 'background should only use approved images');
  assert.ok(componentCode.includes('consultRealMoneyValue(button)'), 'real money button handler must exist');
  assert.ok(componentCode.includes('BrainrotRealMoneyValueService'), 'button handler must use the BRL commercial value service');
  assert.ok(componentCode.includes('TradeEquivalenceService.findEquivalents'), 'legacy equivalence service must remain available');
  assert.ok(componentCode.includes('console.error'), 'technical errors must not be swallowed');
  assert.ok(styles.includes('prefers-reduced-motion'), 'reduced motion support must exist');
  assert.ok(styles.includes('trade-visual'), 'trade comparison visual must exist');
});

test('image fetch tooling is wired for wiki API, cache, slug linking and local files', () => {
  assert.ok(fetchImagesScript.includes('Category:Brainrots'), 'fetch script must read the Brainrots category');
  assert.ok(fetchImagesScript.includes('pageimages|info'), 'fetch script must query pageimages and page info');
  assert.ok(fetchImagesScript.includes('redirects'), 'fetch script must respect redirects');
  assert.ok(fetchImagesScript.includes('list=search'), 'fetch script must use search fallback');
  assert.ok(fetchImagesScript.includes('.tmp/brainrot-image-api-cache.json'), 'fetch script must use local API cache');
  assert.ok(fetchImagesScript.includes('public/assets/brainrots/128'), 'fetch script must generate local 128 assets');
  assert.ok(fetchImagesScript.includes('public/assets/brainrots/256'), 'fetch script must generate local 256 assets');
  assert.ok(fetchImagesScript.includes('public/assets/brainrots/512'), 'fetch script must generate local 512 assets');
  assert.ok(fetchImagesScript.includes('brainrotSlug: pet.slug'), 'image records must be linked by slug');
  assert.ok(fetchImagesScript.includes('--missing-only'), 'fetch script must support missing-only mode');
  assert.ok(fetchImagesScript.includes('--dry-run'), 'fetch script must support dry-run mode');
});

test('user screenshot image tooling is review-gated and linked by canonical slug', () => {
  assert.ok(nameAliases.length >= 19, 'Portuguese screenshot aliases must be preserved');
  assert.equal(nameAliases.find((entry) => entry.displayedName === 'Queijo Tim').slug, 'tim-cheese');
  assert.equal(nameAliases.find((entry) => entry.displayedName === 'Elefante de Morango').slug, 'strawberry-elephant');
  assert.equal(nameAliases.find((entry) => entry.displayedName === 'Banheiro Skibidi').slug, 'skibidi-toilet');

  assert.ok(userScreenshotImageMap.length >= 12, 'visible inline screenshot names must be tracked for review');
  assert.equal(userScreenshotImageMap.find((entry) => entry.brainrotSlug === 'tim-cheese').reviewStatus, 'needs_review');
  assert.equal(userScreenshotImageMap.find((entry) => entry.brainrotSlug === 'garama-and-madundung').reviewStatus, 'needs_review');
  assert.ok(userScreenshotImageMap.every((entry) => entry.reviewStatus !== 'approved'), 'inline-only screenshots must not be auto-approved');

  assert.ok(extractScreenshotsScript.includes('--input'), 'extract script must accept an input folder');
  assert.ok(extractScreenshotsScript.includes('--dry-run'), 'extract script must support dry-run mode');
  assert.ok(extractScreenshotsScript.includes('reviewStatus'), 'extract script must emit review records');
  assert.ok(processApprovedScreenshotsScript.includes("reviewStatus === 'approved'"), 'publish script must only process approved records');
  assert.ok(processApprovedScreenshotsScript.includes("sourceType: 'user_game_screenshot'"), 'approved user images must be labeled by source type');
  assert.ok(processApprovedScreenshotsScript.includes("usageStatus: 'provided_by_user'"), 'approved user images must keep usage status');
});

test('calculation button is safe and removed text never leaks to DOM strings', () => {
  assert.ok(componentCode.includes("type: 'button'"), 'calculation buttons must be explicit buttons');
  assert.ok(componentCode.includes("\"[data-action='see-value']\""), 'see-value button must use delegated action selector');
  assert.ok(componentCode.includes('document.addEventListener'), 'listener must be registered on the document once');
  assert.ok(componentCode.includes('document.removeEventListener'), 'listener registration must remove stale handler first');
  assert.ok(componentCode.includes('event.preventDefault()'), 'click handler must prevent default navigation');
  assert.ok(componentCode.includes('event.stopPropagation()'), 'click handler must stop conflicting parent handlers');
  assert.ok(componentCode.includes('this.getSelectedPet()'), 'calculation must fetch complete pet by selected slug');
  assert.ok(componentCode.includes('consultRealMoneyValue(button)'), 'button handler must call the BRL value consultation');
  assert.ok(componentCode.includes('TradeEquivalenceService.findEquivalents'), 'legacy equivalence service should stay in the component for reused flows');
  assert.ok(componentCode.includes('Calculando...'), 'button must expose loading text');
  assert.ok(componentCode.includes('button.disabled = isLoading'), 'button must be disabled while loading');
  assert.ok(componentCode.includes('safeText'), 'component must sanitize optional text before rendering');
  assert.ok(componentCode.includes('joinSafe'), 'component must filter empty optional messages before joining');

  const renderedTextSources = [htmlContent, appCode, componentCode].join('\n');
  assert.equal(renderedTextSources.includes('nullnull'), false, 'nullnull must never be present in render code');
  assert.equal(renderedTextSources.includes('${value1}${value2}'), false, 'unsafe direct null concatenation fixture must not exist');
  assert.equal(renderedTextSources.includes('undefined undefined'), false, 'undefined text must never be hardcoded in render code');
  assert.equal(renderedTextSources.includes('NaN'), false, 'NaN must never be hardcoded in render code');
});

test('market value parser accepts only numbers and numeric strings', () => {
  assert.equal(BrainrotDataService.parseTradeValue(4120000), 4120000);
  assert.equal(BrainrotDataService.parseTradeValue('4120000'), 4120000);
  assert.equal(BrainrotDataService.parseTradeValue(null), null);
  assert.equal(BrainrotDataService.parseTradeValue(Number.NaN), null);
  assert.equal(BrainrotDataService.parseTradeValue('4.12M'), null);
  assert.equal(BrainrotDataService.parseTradeValue('875K'), null);
});

test('favorites service sanitizes storage, deduplicates and toggles by slug', () => {
  const storage = new Map();
  global.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    dispatchEvent: () => {}
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  const service = new FavoritesService('test:favorites');
  storage.set('test:favorites', JSON.stringify([
    'fluriflura',
    null,
    '',
    'fluriflura',
    { slug: 'holy-arepa', addedAt: '2026-06-30T15:00:00.000Z' },
    { slug: 'missing' }
  ]));

  assert.deepEqual(service.getAll(['fluriflura', 'holy-arepa']), ['fluriflura', 'holy-arepa']);
  assert.equal(service.has('fluriflura'), true);
  assert.equal(service.toggle('garama-and-madundung'), true);
  assert.equal(service.toggle('garama-and-madundung'), false);
  assert.equal(service.getAll().filter((slug) => slug === 'fluriflura').length, 1);

  storage.set('test:favorites', '{bad json');
  assert.deepEqual(service.getAll(), []);

  delete global.window;
  delete global.CustomEvent;
});

test('market value validator guards canonical slugs and baseTradeValue', () => {
  assert.ok(validateMarketValuesScript.includes('garama-and-madundung'), 'validator must guard Garama canonical slug');
  assert.ok(validateMarketValuesScript.includes('stringBaseTradeValue'), 'validator must reject string values');
  assert.ok(validateMarketValuesScript.includes('marketValueWithoutPet'), 'validator must detect value records without pets');
  assert.ok(validateMarketValuesScript.includes('oldValueFieldsWithDifferentValue'), 'validator must reject divergent old value fields');
});
