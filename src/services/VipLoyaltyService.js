export const VIP_LEVELS = Object.freeze([
  { id: 'bronze', name: 'Bronze', minSpentInCents: 0, minOrders: 0, discountPercent: 0, benefits: ['Acesso normal à loja'] },
  { id: 'silver', name: 'Prata', minSpentInCents: 3000, minOrders: 2, discountPercent: 3, benefits: ['3% de desconto em compras futuras'] },
  { id: 'gold', name: 'Ouro', minSpentInCents: 8000, minOrders: 5, discountPercent: 5, benefits: ['5% de desconto', 'Prioridade no suporte'] },
  { id: 'diamond', name: 'Diamante', minSpentInCents: 15000, minOrders: 10, discountPercent: 8, benefits: ['8% de desconto', 'Prioridade no suporte', 'Prioridade na entrega'] }
]);

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
