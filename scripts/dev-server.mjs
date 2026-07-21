import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import crypto from 'node:crypto';
import { STORE_COMMERCE_CONFIG } from '../src/config/store-commerce-config.js';
import { OrderStore } from '../server/store/OrderStore.js';
import { SandboxPixPaymentGateway } from '../server/store/PaymentGateway.js';
import { PixPayloadService, PIX_ERROR_MESSAGES } from '../server/store/PixPayloadService.js';
import { ProductStockStore } from '../server/store/ProductStockStore.js';
import { StoreCommerceService, validatePixPayloadCrc } from '../src/services/grow-garden-2/StoreCommerceService.js';

const root = process.cwd();
const preferredPort = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const fallbackAdminPassword = '3112';
const adminPassword = process.env.ADMIN_ACCESS_PASSWORD || '3112';
const authorizedAdminEmails = String(process.env.ADMIN_AUTHORIZED_EMAILS || 'delima20k@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const adminCookieName = 'thur_admin';
const adminTtlMs = 30 * 60 * 1000;
const adminSessions = new Map();
const adminAttempts = new Map();
const processedWebhookEvents = new Set();
const orderStore = new OrderStore();
const paymentProvider = process.env.PAYMENT_PROVIDER || 'asaas';
const paymentEnvironment = process.env.PAYMENT_ENVIRONMENT || STORE_COMMERCE_CONFIG.paymentEnvironment || 'sandbox';
const pixMode = process.env.PIX_MODE || STORE_COMMERCE_CONFIG.pix.mode || 'manual';
const storeCommerceService = new StoreCommerceService({
  config: {
    ...STORE_COMMERCE_CONFIG,
    pix: Object.freeze({
      ...STORE_COMMERCE_CONFIG.pix,
      key: process.env.PIX_KEY || STORE_COMMERCE_CONFIG.pix.key,
      keyType: process.env.PIX_KEY_TYPE || STORE_COMMERCE_CONFIG.pix.keyType,
      receiverName: process.env.PIX_RECEIVER_NAME || STORE_COMMERCE_CONFIG.pix.receiverName,
      receiverCity: process.env.PIX_RECEIVER_CITY || STORE_COMMERCE_CONFIG.pix.receiverCity,
      mode: pixMode
    })
  }
});
storeCommerceService.fetchJson = async (url) => JSON.parse(readFileSync(join(root, url), 'utf8'));
const storeProductsPath = join(root, 'src/data/grow-garden-2/store-products.json');
const productStockStore = new ProductStockStore({ storePath: storeProductsPath });
const pixPaymentGateway = new SandboxPixPaymentGateway({
  provider: paymentProvider,
  environment: paymentEnvironment,
  pixKey: process.env.PIX_KEY || STORE_COMMERCE_CONFIG.pix.key,
  pixKeyType: process.env.PIX_KEY_TYPE || STORE_COMMERCE_CONFIG.pix.keyType,
  receiverName: process.env.PIX_RECEIVER_NAME || 'Delima Blox',
  receiverCity: process.env.PIX_RECEIVER_CITY || 'SAO PAULO',
  webhookToken: process.env.PAYMENT_WEBHOOK_TOKEN || ''
});
const pixPayloadService = new PixPayloadService();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
};

const sendJson = (response, status, data, headers = {}) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  response.end(JSON.stringify(data));
};

const parseCookies = (request) => Object.fromEntries(String(request.headers.cookie || '')
  .split(';')
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [part, ''];
    return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  }));

const clientIdentity = (request) => request.socket.remoteAddress || 'local';
const adminCookieFor = (token) => `${adminCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(adminTtlMs / 1000)}`;
const clearAdminCookie = () => `${adminCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

const createPixChargePatch = async (order) => {
  const charge = await pixPaymentGateway.createPixPayment({
    order,
    idempotencyKey: `pix:${order.orderCode}:${order.totalInCents}`
  });
  const qrCode = await pixPayloadService.generateQrCode(charge.copyPasteCode);
  return {
    paymentProvider: charge.provider,
    paymentEnvironment: charge.environment,
    paymentId: charge.paymentId,
    paymentStatus: charge.status,
    orderStatus: 'awaiting_payment',
    paymentMode: pixMode,
    pixMode,
    pixPayload: charge.copyPasteCode,
    pixCopyPasteCode: charge.copyPasteCode,
    pixCopyPaste: charge.copyPasteCode,
    pixQrCode: qrCode,
    pixPayloadStatus: 'ready',
    pixPayloadError: null,
    pixTxid: charge.txid,
    pixQrImageUrl: charge.qrCodeImageUrl,
    pixExpiresAt: charge.expiresAt,
    generatedAt: charge.createdAt,
    pixChargeAmountInCents: charge.amountInCents,
    pixChargeCurrency: charge.currency,
    pixExternalReference: charge.externalReference,
    pixIdempotencyKey: charge.idempotencyKey
  };
};

const pixErrorMessage = (code, fallback = 'Nao foi possivel gerar a cobranca Pix do pedido.') => (
  PIX_ERROR_MESSAGES[code] || fallback
);

const publicPixCharge = (order) => ({
  orderCode: order.orderCode,
  paymentStatus: order.paymentStatus || 'pending',
  amountInCents: order.pixChargeAmountInCents || order.totalInCents,
  pixCopyPaste: order.pixPayload || order.pixCopyPasteCode || order.pixCopyPaste,
  qrCodeImageUrl: order.pixQrImageUrl || `/api/orders/${encodeURIComponent(order.orderCode)}/pix-qr.svg`,
  expiresAt: order.pixExpiresAt || null,
  status: order.paymentStatus || 'pending',
  order: publicOrder(order)
});

const publicOrder = (order) => ({
  orderCode: order.orderCode,
  public_code: order.public_code || order.orderCode,
  items: Array.isArray(order.items) ? order.items : [],
  productSlug: order.productSlug || order.seedSlug || null,
  productName: order.productName || order.seedName || null,
  quantity: order.quantity || null,
  subtotalInCents: order.subtotalInCents,
  discountInCents: order.discountInCents || 0,
  totalInCents: order.totalInCents,
  customerName: order.customerName || order.customer_name || '',
  customerEmail: order.customerEmail || order.email || order.customer_email || '',
  robloxUsername: order.robloxUsername || '',
  paymentMethod: order.paymentMethod || 'pix',
  paymentStatus: order.paymentStatus || 'pending',
  orderStatus: order.orderStatus || 'awaiting_payment',
  deliveryStatus: order.deliveryStatus || 'pending',
  couponCode: order.couponCode || null,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  pixPayload: order.pixPayload || order.pixCopyPasteCode || order.pixCopyPaste || null,
  pixCopyPasteCode: order.pixPayload || order.pixCopyPasteCode || order.pixCopyPaste || null,
  pixCopyPaste: order.pixPayload || order.pixCopyPasteCode || order.pixCopyPaste || null,
  pixPayloadStatus: order.pixPayloadStatus || null,
  pixPayloadError: order.pixPayloadError || null,
  pixQrImageUrl: order.pixQrImageUrl || (order.pixPayload ? `/api/orders/${encodeURIComponent(order.orderCode)}/pix-qr.svg` : null),
  pixExpiresAt: order.pixExpiresAt || null,
  pixChargeAmountInCents: order.pixChargeAmountInCents || order.totalInCents
});

const hasActivePixCharge = (order) => (
  Boolean(order?.pixPayload && order?.paymentId && order?.pixExpiresAt)
  && new Date(order.pixExpiresAt).getTime() > Date.now()
  && validatePixPayloadCrc(order.pixPayload)
);

const statusPatchFromWebhookEvent = ({ order, event }) => {
  if (event.currency !== 'BRL' || event.externalReference !== order.orderCode || event.amountInCents !== order.totalInCents) {
    return {
      paymentStatus: 'amount_mismatch',
      orderStatus: 'awaiting_payment',
      paymentReviewReason: 'Valor, moeda ou referencia do pagamento nao correspondem ao pedido.',
      paymentWebhookPayload: event.raw
    };
  }
  if (event.status === 'confirmed') {
    return {
      paymentStatus: 'confirmed',
      orderStatus: 'paid',
      paidAt: new Date().toISOString(),
      paymentReviewReason: null,
      paymentWebhookPayload: event.raw
    };
  }
  if (['expired', 'cancelled', 'failed', 'refunded'].includes(event.status)) {
    return {
      paymentStatus: event.status,
      orderStatus: event.status === 'refunded' ? 'refunded' : 'cancelled',
      paymentWebhookPayload: event.raw
    };
  }
  return {
    paymentStatus: 'pending',
    orderStatus: 'awaiting_payment',
    paymentWebhookPayload: event.raw
  };
};

const isAdminAuthorized = (request) => {
  const token = parseCookies(request)[adminCookieName];
  const session = token ? adminSessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now() || !isAdminEmailAuthorized(session.email)) {
    if (token) adminSessions.delete(token);
    return false;
  }
  return true;
};

const canAttemptAdminAccess = (request) => {
  const key = clientIdentity(request);
  const attempt = adminAttempts.get(key) || { count: 0, lockedUntil: 0 };
  if (attempt.lockedUntil > Date.now()) {
    return { ok: false, key, attempt };
  }
  return { ok: true, key, attempt };
};

const recordFailedAdminAttempt = (key, attempt) => {
  const count = attempt.count + 1;
  adminAttempts.set(key, {
    count: count >= 5 ? 0 : count,
    lockedUntil: count >= 5 ? Date.now() + (5 * 60 * 1000) : 0
  });
};

const isAdminPasswordValid = (password) => {
  const value = String(password || '');
  return value === adminPassword || value === fallbackAdminPassword;
};

const isAdminEmailAuthorized = (email) => authorizedAdminEmails.includes(String(email || '').trim().toLowerCase());

const saveStoreProductStockChanges = (changesBySlug) => {
  console.info('ADMIN_STOCK_SAVE_REQUEST', {
    slugs: Object.keys(changesBySlug || {}),
    changes: changesBySlug
  });
  const result = productStockStore.updateProductStocks(changesBySlug);
  const productsBySlug = new Map((result.products || []).map((product) => [product.slug, product]));
  console.info('ADMIN_STOCK_SAVE_RESULT', {
    saved: Object.keys(result.saved || {}).map((slug) => {
      const product = productsBySlug.get(slug) || {};
      return {
        slug,
        name: product.name || '',
        category: product.category || '',
        availableStock: product.availableStock,
        saleEnabled: product.saleEnabled,
        stockStatus: product.stockStatus
      };
    }),
    errors: result.errors
  });
  if (Object.keys(result.saved).length > 0) {
    storeCommerceService.cache = null;
  }
  return {
    saved: result.saved,
    errors: result.errors,
    products: result.products
  };
};

const getCustomerIdentity = (request, url, body = {}) => ({
  email: String(body.email || request.headers['x-customer-email'] || url.searchParams.get('email') || '').trim().toLowerCase(),
  userId: String(body.userId || body.customerUserId || request.headers['x-customer-user-id'] || url.searchParams.get('userId') || '').trim()
});

const orderBelongsToCustomer = (order, identity) => {
  if (!order || !identity.email) return false;
  const orderUserId = String(order.customerUserId || order.customer_user_id || order.userId || '').trim();
  if (orderUserId && identity.userId) return orderUserId === identity.userId;
  if (orderUserId && !identity.userId) return false;
  const orderEmail = String(order.email || order.customerEmail || order.customer_email || '').trim().toLowerCase();
  return Boolean(orderEmail && orderEmail === identity.email);
};

const sendPixChargeForOrder = async (existing, response) => {
  if (['confirmed', 'paid'].includes(existing.paymentStatus) || existing.orderStatus === 'paid') {
    sendJson(response, 409, { code: 'ORDER_ALREADY_PAID', error: 'Pedido ja pago.' });
    return;
  }
  if (!Number.isInteger(existing.totalInCents) || existing.totalInCents <= 0) {
    sendJson(response, 422, { code: 'INVALID_PAYMENT_AMOUNT', error: 'Total do pedido invalido.' });
    return;
  }
  if (hasActivePixCharge(existing)) {
    sendJson(response, 200, publicPixCharge(existing));
    return;
  }
  try {
    const chargePatch = await createPixChargePatch(existing);
    const chargedOrder = orderStore.updateStatus(existing.orderCode, chargePatch);
    sendJson(response, 200, publicPixCharge(chargedOrder || existing));
  } catch (error) {
    console.error('PIX_CHARGE_ERROR', {
      endpoint: `/api/store/orders/${existing.orderCode}/pix`,
      method: 'POST',
      body: {},
      status: 500,
      code: error.code || 'PIX_PAYLOAD_ERROR',
      message: error.message,
      stack: error.stack
    });
    sendJson(response, 500, {
      code: error.code || 'PIX_PAYLOAD_ERROR',
      error: pixErrorMessage(error.code)
    });
  }
};

const handleAdminAccessApi = async ({ request, response, url }) => {
  if (request.method === 'POST' && url.pathname === '/api/admin/access') {
    const attempt = canAttemptAdminAccess(request);
    if (!attempt.ok) {
      sendJson(response, 429, { authorized: false, error: 'Muitas tentativas. Aguarde alguns minutos.' });
      return true;
    }
    const body = await readJsonBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) {
      recordFailedAdminAttempt(attempt.key, attempt.attempt);
      sendJson(response, 400, { authorized: false, error: 'Informe o e-mail.' });
      return true;
    }
    if (!isAdminEmailAuthorized(email)) {
      recordFailedAdminAttempt(attempt.key, attempt.attempt);
      sendJson(response, 403, { authorized: false, error: 'E-mail ou senha invalidos.' });
      return true;
    }
    if (!isAdminPasswordValid(body.password)) {
      recordFailedAdminAttempt(attempt.key, attempt.attempt);
      sendJson(response, 401, { authorized: false, error: 'Senha invalida.' });
      return true;
    }
    adminAttempts.delete(attempt.key);
    const token = crypto.randomBytes(32).toString('base64url');
    adminSessions.set(token, { email, expiresAt: Date.now() + adminTtlMs });
    sendJson(response, 200, { authorized: true, email, expiresInSeconds: Math.floor(adminTtlMs / 1000) }, { 'Set-Cookie': adminCookieFor(token) });
    return true;
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/session') {
    const token = parseCookies(request)[adminCookieName];
    const session = token ? adminSessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now() || !isAdminEmailAuthorized(session.email)) {
      if (token) adminSessions.delete(token);
      sendJson(response, 401, { authorized: false });
      return true;
    }
    sendJson(response, 200, { authorized: true, email: session.email, expiresInSeconds: Math.floor((session.expiresAt - Date.now()) / 1000) });
    return true;
  }
  if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
    const token = parseCookies(request)[adminCookieName];
    if (token) adminSessions.delete(token);
    sendJson(response, 200, { ok: true }, { 'Set-Cookie': clearAdminCookie() });
    return true;
  }
  return false;
};

const handleOrderApi = async ({ request, response, url }) => {
  if (!url.pathname.startsWith('/api/orders') && !url.pathname.startsWith('/api/store/orders') && !url.pathname.startsWith('/api/payments')) return false;
  if (request.method === 'GET' && url.pathname === '/api/orders') {
    sendJson(response, 200, { orders: [] });
    return true;
  }
  if (request.method === 'POST' && /^\/api\/store\/orders\/[^/]+\/pix$/.test(url.pathname)) {
    const orderCode = decodeURIComponent(url.pathname.split('/').at(-2));
    const existing = orderStore.findByCode(orderCode);
    if (!existing) {
      sendJson(response, 404, { code: 'ORDER_NOT_FOUND', error: 'Pedido nao encontrado.' });
      return true;
    }
    await sendPixChargeForOrder(existing, response);
    return true;
  }
  if (request.method === 'POST' && (url.pathname === '/api/orders' || url.pathname === '/api/store/orders')) {
    const body = await readJsonBody(request);
    const catalog = await storeCommerceService.getStoreCatalog();
    const requestedItems = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : [{ productSlug: body.seedSlug || body.productSlug, seedSlug: body.seedSlug || body.productSlug, quantity: body.quantity }];
    const termsAccepted = body.termsAccepted === true || body.acceptedTerms === true;
    const items = requestedItems.map((item) => {
      const productSlug = item.productSlug || item.seedSlug;
      const product = catalog.find((entry) => entry.slug === productSlug);
      return product ? { seed: { ...product, commerce: product }, quantity: item.quantity } : null;
    });
    if (items.some((item) => !item)) {
      sendJson(response, 404, { code: 'PRODUCT_NOT_FOUND', error: 'Produto nao encontrado.' });
      return true;
    }
    const result = storeCommerceService.buildCartPixOrder({
      items,
      customerName: body.customerName,
      customerUserId: body.customerUserId || body.userId || null,
      robloxUsername: body.robloxUsername,
      robloxDisplayName: body.robloxDisplayName,
      email: body.email,
      couponCode: body.couponCode,
      coupons: await storeCommerceService.loadCoupons(),
      termsAccepted
    });
    if (!result.ok) {
      sendJson(response, 400, { code: result.code, error: result.errors.join(' ') });
      return true;
    }
    try {
      const order = orderStore.create(result.order);
      const chargePatch = await createPixChargePatch(order);
      const chargedOrder = orderStore.updateStatus(order.orderCode, chargePatch);
      sendJson(response, 201, { order: publicOrder(chargedOrder || order) });
    } catch (error) {
      console.error('ORDER_OR_PAYMENT_ERROR', {
        endpoint: url.pathname,
        method: 'POST',
        body,
        status: 500,
        code: error.code || 'ORDER_OR_PAYMENT_ERROR',
        message: error.message,
        stack: error.stack
      });
      sendJson(response, 500, {
        code: error.code || 'ORDER_OR_PAYMENT_ERROR',
        error: pixErrorMessage(error.code, 'Nao foi possivel criar a cobranca Pix do pedido.')
      });
    }
    return true;
  }
  if (request.method === 'POST' && url.pathname === '/api/payments/webhook') {
    const verification = pixPaymentGateway.verifyWebhook({ headers: request.headers });
    if (!verification.ok) {
      sendJson(response, 401, { ok: false, code: verification.reason });
      return true;
    }
    const body = await readJsonBody(request);
    const event = pixPaymentGateway.parseWebhookEvent(body);
    if (processedWebhookEvents.has(event.eventId)) {
      sendJson(response, 200, { ok: true, duplicate: true });
      return true;
    }
    const order = orderStore.findByCode(event.externalReference);
    if (!order || (event.paymentId && order.paymentId && event.paymentId !== order.paymentId)) {
      processedWebhookEvents.add(event.eventId);
      sendJson(response, 202, { ok: true, review: true, reason: 'ORDER_NOT_FOUND_OR_PAYMENT_ID_MISMATCH' });
      return true;
    }
    const updated = orderStore.updateStatus(order.orderCode, {
      ...statusPatchFromWebhookEvent({ order, event }),
      lastPaymentWebhookEventId: event.eventId,
      lastPaymentWebhookAt: new Date().toISOString()
    });
    processedWebhookEvents.add(event.eventId);
    sendJson(response, 200, { ok: true, order: updated });
    return true;
  }
  if (request.method === 'GET' && /^\/api\/orders\/[^/]+\/pix-qr\.svg$/.test(url.pathname)) {
    const orderCode = url.pathname.split('/').at(-2);
    const order = orderStore.findByCode(orderCode);
    if (!order || !order.pixPayload || !validatePixPayloadCrc(order.pixPayload)) {
      sendJson(response, 404, { error: 'QR Code Pix indisponivel para este pedido.' });
      return true;
    }
    const svg = order.pixQrCode || await pixPayloadService.generateQrCode(order.pixPayload);
    response.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(svg);
    return true;
  }
  if (request.method === 'POST' && /^\/api\/orders\/[^/]+\/report-payment$/.test(url.pathname)) {
    const orderCode = url.pathname.split('/').at(-2);
    const existing = orderStore.findByCode(orderCode);
    if (!existing) {
      sendJson(response, 404, { error: 'Pedido nao encontrado.' });
      return true;
    }
    const order = orderStore.updateStatus(orderCode, {
      customerReportedPayment: true,
      customerReportedPaymentAt: new Date().toISOString(),
      paymentStatus: 'pending',
      orderStatus: 'awaiting_payment'
    });
    sendJson(response, 200, { order: publicOrder(order) });
    return true;
  }
  return false;
};

const handleCustomerOrderApi = async ({ request, response, url }) => {
  if (!url.pathname.startsWith('/api/customer/orders')) return false;
  const body = ['POST', 'PATCH', 'PUT'].includes(request.method) ? await readJsonBody(request) : {};
  const identity = getCustomerIdentity(request, url, body);
  if (!identity.email) {
    sendJson(response, 401, { error: 'Cliente nao identificado.' });
    return true;
  }
  if (request.method === 'GET' && url.pathname === '/api/customer/orders') {
    const orders = orderStore.listAll()
      .filter((order) => orderBelongsToCustomer(order, identity))
      .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime())
      .map((order) => publicOrder(order));
    sendJson(response, 200, { ok: true, orders });
    return true;
  }
  const orderMatch = url.pathname.match(/^\/api\/customer\/orders\/([^/]+)(?:\/pix)?$/);
  if (!orderMatch) {
    sendJson(response, 404, { error: 'Pedido nao encontrado.' });
    return true;
  }
  const orderCode = decodeURIComponent(orderMatch[1]);
  const order = orderStore.findByCode(orderCode);
  if (!order || !orderBelongsToCustomer(order, identity)) {
    sendJson(response, 404, { error: 'Pedido nao encontrado nesta conta.' });
    return true;
  }
  if (request.method === 'GET' && !url.pathname.endsWith('/pix')) {
    sendJson(response, 200, { ok: true, order: publicOrder(order) });
    return true;
  }
  if (request.method === 'POST' && url.pathname.endsWith('/pix')) {
    await sendPixChargeForOrder(order, response);
    return true;
  }
  sendJson(response, 405, { error: 'Metodo nao permitido.' });
  return true;
};

const handleAccessApi = async ({ request, response, url }) => {
  if (url.pathname.startsWith('/api/admin/')) {
    if (!isAdminAuthorized(request)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/orders') {
      sendJson(response, 200, { ok: true, orders: orderStore.listAll() });
      return true;
    }
    if (['POST', 'PATCH'].includes(request.method) && url.pathname === '/api/admin/products/stock') {
      const body = await readJsonBody(request);
      const changes = body.changes && typeof body.changes === 'object' ? body.changes : body;
      const result = saveStoreProductStockChanges(changes);
      const status = Object.keys(result.saved).length > 0 || Object.keys(result.errors).length === 0 ? 200 : 400;
      sendJson(response, status, { ok: Object.keys(result.errors).length === 0, ...result });
      return true;
    }
    if (request.method === 'PATCH' && /^\/api\/admin\/orders\/[^/]+$/.test(url.pathname)) {
      const orderCode = url.pathname.split('/').pop();
      const body = await readJsonBody(request);
      const order = orderStore.updateStatus(orderCode, body);
      sendJson(response, order ? 200 : 404, order ? { ok: true, order } : { error: 'Pedido nao encontrado.' });
      return true;
    }
    sendJson(response, 200, { ok: true });
    return true;
  }
  return false;
};

const isFrontendRoute = (pathname) => (
  /^\/(?:brainrot|brainrots|roube-um-brainrot)(?:\/|$)/i.test(pathname)
  || /^\/(?:grow-garden|grow-garden-2)(?:\/|$)/i.test(pathname)
  || /^\/(?:blox-fruits|category\/blox-fruits)(?:\/|$)/i.test(pathname)
  || /^\/(?:terms|termos)(?:\/|$)/i.test(pathname)
  || /^\/(?:admin|painel|support-admin|orders-admin|stock-admin|suporte-admin|pedidos-admin|estoque|produtos-admin)(?:\/|$)/i.test(pathname)
);

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (await handleOrderApi({ request, response, url })) return;
  if (await handleCustomerOrderApi({ request, response, url })) return;
  if (await handleAdminAccessApi({ request, response, url })) return;
  if (await handleAccessApi({ request, response, url })) return;

  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, requestedPath === '/' || isFrontendRoute(url.pathname) ? 'index.html' : requestedPath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  if (statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
});

const listen = (port, attemptsLeft = 10) => {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`porta ${port} ocupada; tentando ${nextPort}`);
      listen(nextPort, attemptsLeft - 1);
      return;
    }
    throw error;
  });
  server.listen(port, host, () => {
    console.log(`delima blox dev server: http://${host}:${port}`);
  });
};

listen(preferredPort);
