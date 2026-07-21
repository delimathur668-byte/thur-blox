export const REVIEW_STORAGE_KEY = 'thur_blox_reviews';
const THANK_YOU_SEEN_PREFIX = 'thur_blox_thank_you_seen_order_';

const createId = () => `review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

export class ReviewService {
  constructor({ storage = globalThis.localStorage, now = () => new Date().toISOString() } = {}) {
    this.storage = storage;
    this.now = now;
  }

  list() {
    if (!this.storage) return [];
    try {
      const parsed = JSON.parse(this.storage.getItem(REVIEW_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  getByOrderId(orderId) {
    const id = String(orderId || '').trim().toUpperCase();
    return this.list().find((review) => String(review.orderId || '').toUpperCase() === id) || null;
  }

  create({ orderId, customerName = '', robloxNick = '', rating, comment = '', productNames = [], total = 0 } = {}) {
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedRating = Number(rating);
    if (!normalizedOrderId) throw new Error('Pedido invalido para avaliacao.');
    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) throw new Error('Escolha uma nota para enviar sua avaliacao.');
    if (this.getByOrderId(normalizedOrderId)) throw new Error('Voce ja avaliou esta compra.');
    const review = {
      id: createId(), orderId: normalizedOrderId,
      customerName: String(customerName || '').trim(), robloxNick: String(robloxNick || '').trim(),
      rating: normalizedRating, comment: String(comment || '').trim().slice(0, 1000),
      createdAt: this.now(), productNames: Array.isArray(productNames) ? productNames.map(String) : [],
      total: Number(total || 0), status: 'pending'
    };
    const reviews = this.list();
    reviews.unshift(review);
    this.storage?.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviews));
    return review;
  }

  hasSeenThankYou(orderId) { return this.storage?.getItem(`${THANK_YOU_SEEN_PREFIX}${orderId}`) === 'true'; }
  markThankYouSeen(orderId) { if (this.storage && orderId) this.storage.setItem(`${THANK_YOU_SEEN_PREFIX}${orderId}`, 'true'); }
}
