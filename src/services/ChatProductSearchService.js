export const CHAT_PURCHASE_KEYWORDS = ['quero', 'comprar', 'tem', 'vende', 'preco', 'quanto custa', 'adicionar', 'carrinho'];

const CATEGORY_ALIASES = Object.freeze({
  seeds: ['seed', 'seeds', 'semente', 'sementes'], pets: ['pet', 'pets'],
  gears: ['gear', 'gears', 'equipamento', 'equipamentos'], fruits: ['fruit', 'fruits', 'fruta', 'frutas'],
  gamepasses: ['gamepass', 'gamepasses'], packages: ['pacote', 'pacotes', 'package', 'packages'],
  'blox-packages': ['pacote blox', 'pacotes blox']
});

export const normalizeChatSearchText = (value) => String(value || '').toLocaleLowerCase('pt-BR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

const keywordPattern = (keyword) => new RegExp(`(^|\\s)${keyword.replace(' ', '\\s+')}($|\\s)`);

export const hasChatPurchaseIntent = (message) => {
  const text = normalizeChatSearchText(message);
  return CHAT_PURCHASE_KEYWORDS.some((keyword) => keywordPattern(keyword).test(text));
};

const isAvailable = (product) => product?.saleEnabled === true && product?.stockStatus !== 'out_of_stock' && Number(product?.availableStock) > 0;
const getRequestedCategory = (text) => Object.entries(CATEGORY_ALIASES)
  .find(([, aliases]) => aliases.some((alias) => keywordPattern(alias).test(text)))?.[0] || '';

const getSearchQuery = (message) => {
  let query = normalizeChatSearchText(message);
  [...CHAT_PURCHASE_KEYWORDS].sort((a, b) => b.length - a.length).forEach((keyword) => {
    query = query.replace(new RegExp(`(^|\\s)${keyword.replace(' ', '\\s+')}($|\\s)`, 'g'), ' ');
  });
  return query.replace(/\b(por favor|eu|um|uma|o|a|de|do|da)\b/g, ' ').replace(/\s+/g, ' ').trim();
};

export const findChatProduct = (message, products = []) => {
  if (!hasChatPurchaseIntent(message)) return null;
  const query = getSearchQuery(message);
  if (!query) return null;
  const requestedCategory = getRequestedCategory(query);
  const queryTokens = query.split(' ').filter((token) => token.length > 1);
  const candidates = products.map((product, index) => {
    const name = normalizeChatSearchText(`${product.name || ''} ${product.slug || ''}`.replace(/-/g, ' '));
    const productTokens = new Set(name.split(' '));
    const matchedTokens = queryTokens.filter((token) => productTokens.has(token));
    const categoryMatch = requestedCategory && (product.category === requestedCategory || (requestedCategory === 'packages' && product.category === 'blox-packages'));
    let score = matchedTokens.length * 10 + (categoryMatch ? 25 : 0);
    if (name === query) score += 100;
    if (name.includes(query)) score += 40;
    return { product, score: score > 0 ? score + (isAvailable(product) ? 3 : 0) : 0, index };
  }).filter(({ score }) => score > 0);
  candidates.sort((a, b) => b.score - a.score || Number(isAvailable(b.product)) - Number(isAvailable(a.product)) || a.index - b.index);
  return candidates[0]?.product || null;
};

export const getChatProductRoute = (product, { cart = false } = {}) => {
  const game = product?.game === 'blox-fruits' ? 'blox-fruits' : 'grow-a-garden-2';
  return `/category/${game}?${cart ? 'tab=carrinho' : `produto=${encodeURIComponent(product?.slug || '')}`}`;
};
