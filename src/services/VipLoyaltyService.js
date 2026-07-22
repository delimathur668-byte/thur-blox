export const VIP_LEVELS = Object.freeze([
  { id: 'bronze', name: 'Bronze', minSpentInCents: 0, minOrders: 0, discountPercent: 0, benefits: ['Acesso normal à loja'] },
  { id: 'silver', name: 'Prata', minSpentInCents: 3000, minOrders: 2, discountPercent: 3, benefits: ['3% de desconto em compras futuras'] },
  { id: 'gold', name: 'Ouro', minSpentInCents: 8000, minOrders: 5, discountPercent: 5, benefits: ['5% de desconto', 'Prioridade no suporte'] },
  { id: 'diamond', name: 'Diamante', minSpentInCents: 15000, minOrders: 10, discountPercent: 8, benefits: ['8% de desconto', 'Prioridade no suporte', 'Prioridade na entrega'] }
]);
export const VIP_OVERRIDES_STORAGE_KEY = 'thur_blox_vip_overrides';

const normalize = (value) => String(value || '').trim().toLowerCase();
const cancelledStatuses = new Set(['cancelled', 'canceled', 'cancelado', 'refunded', 'reembolsado']);
const eligibleStatuses = new Set(['confirmed', 'paid', 'pago', 'preparing_delivery', 'delivering', 'em_entrega', 'delivered', 'entregue']);

export const isVipEligibleOrder = (order = {}) => {
  const statuses = [order.paymentStatus, order.orderStatus, order.deliveryStatus].map(normalize).filter(Boolean);
  if (statuses.some((status) => cancelledStatuses.has(status))) return false;
  return statuses.some((status) => eligibleStatuses.has(status));
};

export const orderMatchesCustomer = (order = {}, customer = {}) => {
  const userId = normalize(customer.userId || customer.id);
  const email = normalize(customer.email);
  const name = normalize(customer.name || customer.customerName);
  const orderUserId = normalize(order.customerUserId || order.customer_user_id || order.userId);
  const orderEmail = normalize(order.customerEmail || order.customer_email || order.email);
  const orderName = normalize(order.customerName || order.customer_name);
  if (userId && orderUserId) return userId === orderUserId;
  if (email && orderEmail) return email === orderEmail;
  return Boolean(name && orderName && name === orderName);
};

export const calculateVipStatus = (orders = []) => {
  const eligibleOrders = orders.filter(isVipEligibleOrder);
  const totalSpentInCents = eligibleOrders.reduce((total, order) => total + Math.max(0, Number(order.totalInCents || order.total_in_cents || 0)), 0);
  const completedOrders = eligibleOrders.length;
  const levelIndex = VIP_LEVELS.reduce((result, level, index) => (
    totalSpentInCents >= level.minSpentInCents || completedOrders >= level.minOrders ? index : result
  ), 0);
  const level = VIP_LEVELS[levelIndex];
  const nextLevel = VIP_LEVELS[levelIndex + 1] || null;
  const spentProgress = nextLevel ? Math.min(1, totalSpentInCents / nextLevel.minSpentInCents) : 1;
  const ordersProgress = nextLevel ? Math.min(1, completedOrders / nextLevel.minOrders) : 1;
  const amountRemainingInCents = nextLevel ? Math.max(0, nextLevel.minSpentInCents - totalSpentInCents) : 0;
  const ordersRemaining = nextLevel ? Math.max(0, nextLevel.minOrders - completedOrders) : 0;
  return {
    level, nextLevel, totalSpentInCents, completedOrders,
    progressPercent: Math.round(Math.max(spentProgress, ordersProgress) * 100),
    amountRemainingInCents, ordersRemaining
  };
};

export const getVipStatusForCustomer = (orders, customer) => calculateVipStatus((orders || []).filter((order) => orderMatchesCustomer(order, customer)));

export const getVipCustomerKey = (customer = {}) => normalize(customer.userId || customer.id || customer.email || customer.name || customer.customerName);

const applyOverride = (status, overrideLevel) => {
  const override = VIP_LEVELS.find((level) => level.id === normalize(overrideLevel));
  if (!override) return { ...status, automaticLevel: status.level, overrideLevel: 'automatic', isManualOverride: false };
  const levelIndex = VIP_LEVELS.findIndex((level) => level.id === override.id);
  const nextLevel = VIP_LEVELS[levelIndex + 1] || null;
  const amountRemainingInCents = nextLevel ? Math.max(0, nextLevel.minSpentInCents - status.totalSpentInCents) : 0;
  const ordersRemaining = nextLevel ? Math.max(0, nextLevel.minOrders - status.completedOrders) : 0;
  const progressPercent = nextLevel ? Math.round(Math.max(
    Math.min(1, status.totalSpentInCents / nextLevel.minSpentInCents),
    Math.min(1, status.completedOrders / nextLevel.minOrders)
  ) * 100) : 100;
  return { ...status, automaticLevel: status.level, level: override, nextLevel, amountRemainingInCents, ordersRemaining, progressPercent, overrideLevel: override.id, isManualOverride: true };
};

export class VipService {
  constructor({ storage = typeof window !== 'undefined' ? window.localStorage : null } = {}) {
    this.storage = storage;
  }

  loadOverrides() {
    if (!this.storage) return {};
    try {
      const parsed = JSON.parse(this.storage.getItem(VIP_OVERRIDES_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  getCustomerVipLevel(customer, orders = []) {
    const status = getVipStatusForCustomer(orders, customer);
    return applyOverride(status, this.loadOverrides()[getVipCustomerKey(customer)]);
  }

  calculateVipLevel(customerOrders = []) { return calculateVipStatus(customerOrders); }
  getVipDiscount(level) { return VIP_LEVELS.find((item) => item.id === normalize(level) || item.name.toLowerCase() === normalize(level))?.discountPercent || 0; }
  getVipProgress(customerOrders = []) { return calculateVipStatus(customerOrders); }

  getVipSummary(customers = []) {
    return customers.reduce((summary, customer) => {
      summary.total += 1;
      summary[customer.vip.level.id] += 1;
      summary.revenueInCents += customer.vip.totalSpentInCents;
      if (['gold', 'diamond'].includes(customer.vip.level.id)) summary.priority += 1;
      return summary;
    }, { total: 0, bronze: 0, silver: 0, gold: 0, diamond: 0, revenueInCents: 0, priority: 0 });
  }

  setManualVipLevel(customer, level) {
    const key = getVipCustomerKey(customer);
    const normalizedLevel = normalize(level);
    if (!key) throw new Error('Cliente VIP inválido.');
    if (normalizedLevel === 'automatic') return this.clearManualVipLevel(customer);
    if (!VIP_LEVELS.some((item) => item.id === normalizedLevel)) throw new Error('Nível VIP inválido.');
    const overrides = this.loadOverrides();
    overrides[key] = normalizedLevel;
    this.storage?.setItem(VIP_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
    return normalizedLevel;
  }

  clearManualVipLevel(customer) {
    const overrides = this.loadOverrides();
    delete overrides[getVipCustomerKey(customer)];
    this.storage?.setItem(VIP_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
    return 'automatic';
  }
}

export const calculateVipDiscountInCents = (subtotalInCents, discountPercent) => {
  const subtotal = Math.max(0, Number.isInteger(subtotalInCents) ? subtotalInCents : 0);
  const percent = [0, 3, 5, 8].includes(Number(discountPercent)) ? Number(discountPercent) : 0;
  return Math.min(subtotal, Math.floor(subtotal * percent / 100));
};

export const selectBestDiscount = ({ subtotalInCents, couponDiscountInCents = 0, vipDiscountPercent = 0 } = {}) => {
  const vipDiscountInCents = calculateVipDiscountInCents(subtotalInCents, vipDiscountPercent);
  const coupon = Math.min(Math.max(0, Number(couponDiscountInCents) || 0), Math.max(0, subtotalInCents || 0));
  return coupon >= vipDiscountInCents
    ? { source: coupon > 0 ? 'coupon' : vipDiscountInCents > 0 ? 'vip' : 'none', discountInCents: Math.max(coupon, vipDiscountInCents), vipDiscountInCents, couponDiscountInCents: coupon }
    : { source: 'vip', discountInCents: vipDiscountInCents, vipDiscountInCents, couponDiscountInCents: coupon };
};
