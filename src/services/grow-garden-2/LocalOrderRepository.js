const DEFAULT_STORAGE_KEY = 'thur_blox_local_orders';

export const isActiveOrder = (order = {}) => {
  const status = String(order.orderStatus || order.status || '').toLowerCase();
  return !['cancelled', 'canceled'].includes(status)
    && order.archived !== true
    && order.deleted !== true;
};

export class LocalOrderRepository {
  constructor({ storage = globalThis.localStorage, storageKey = DEFAULT_STORAGE_KEY } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  readStore() {
    if (!this.storage) return { orders: [] };
    try {
      const parsed = JSON.parse(this.storage.getItem(this.storageKey) || '{"orders":[]}');
      return { orders: Array.isArray(parsed.orders) ? parsed.orders : [] };
    } catch {
      return { orders: [] };
    }
  }

  writeStore(store) {
    if (!this.storage) throw new Error('localStorage indisponivel.');
    this.storage.setItem(this.storageKey, JSON.stringify({
      orders: Array.isArray(store.orders) ? store.orders : []
    }));
  }

  create(order) {
    const store = this.readStore();
    const safeOrder = {
      ...order,
      storageMode: 'local',
      storageLabel: 'Pedido manual.',
      customer_user_id: order.customerUserId || order.customer_user_id || null,
      customer_email: order.email || '',
      customer_name: order.customerName || '',
      public_code: order.orderCode,
      createdAt: order.createdAt || new Date().toISOString()
    };
    store.orders = store.orders.filter((item) => item.orderCode !== safeOrder.orderCode);
    store.orders.unshift(safeOrder);
    this.writeStore(store);
    return safeOrder;
  }

  findByCode(orderCode) {
    const code = String(orderCode || '').trim().toUpperCase();
    return this.readStore().orders.find((order) => order.orderCode === code) || null;
  }

  list() {
    return [...this.readStore().orders];
  }

  update(orderCode, changes) {
    const code = String(orderCode || '').trim().toUpperCase();
    const store = this.readStore();
    const order = store.orders.find((item) => item.orderCode === code);
    if (!order) return null;
    Object.assign(order, changes, { updatedAt: new Date().toISOString() });
    this.writeStore(store);
    return order;
  }
}
