const normalize = (value) => String(value || '').toLocaleLowerCase('pt-BR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const includesAny = (text, terms) => terms.some((term) => text.includes(term));
const matchesWord = (text, terms) => terms.some((term) => new RegExp(`(^|\\s)${term.replace(/\s+/g, '\\s+')}($|[\\s,.!?])`).test(text));

const INTENT_RULES = [
  ['security_warning', (text) => includesAny(text, ['minha senha', 'meu cookie', 'codigo 2fa', 'código 2fa', 'meu token', 'quer meu codigo', 'quer meu código', 'acesso a minha conta'])],
  ['support_human', (text) => includesAny(text, ['falar com atendente', 'falar com humano', 'chamar atendente', 'quero atendente', 'falar com admin', 'suporte humano'])],
  ['wrong_nick', (text) => includesAny(text, ['nick errado', 'nickname errado', 'passei o nick', 'corrigir nick', 'trocar nick'])],
  ['refund', (text) => includesAny(text, ['reembolso', 'reembolsar', 'devolver dinheiro', 'cancelar compra'])],
  ['payment_done', (text) => includesAny(text, ['ja paguei', 'já paguei', 'paguei no pix', 'pix pago', 'fiz o pix', 'pagamento feito'])],
  ['delivery_problem', (text) => includesAny(text, ['nao chegou', 'não chegou', 'problema na entrega', 'atraso', 'nao recebi', 'não recebi', 'cadê minha entrega', 'cade minha entrega'])],
  ['order_status', (text) => includesAny(text, ['meu pedido', 'status do pedido', 'acompanhar pedido', 'ver pedido', 'codigo do pedido', 'código do pedido'])],
  ['payment_pix', (text) => includesAny(text, ['pix', 'qr code', 'copia e cola', 'pagar', 'pagamento'])],
  ['ask_price', (text) => includesAny(text, ['quanto custa', 'qual o preco', 'qual o preço', 'preco de', 'preço de', 'valor de'])],
  ['buy_product', (text) => includesAny(text, ['fazer uma compra', 'quero comprar']) || (matchesWord(text, ['quero', 'comprar', 'adicionar', 'carrinho', 'vende', 'tem']) && Boolean(extractProductMention(text)))],
  ['product_search', (text) => Boolean(extractProductMention(text)) || includesAny(text, ['produto', 'catalogo', 'catálogo', 'loja'])],
  ['greeting', (text) => matchesWord(text, ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'eai'])]
];

const PRODUCT_ALIASES = [
  ['kitsune fruit', ['kitsune fruit', 'kitsune']], ['dragon fruit', ['dragon fruit', 'dragon']],
  ['leopard fruit', ['leopard fruit', 'leopard']], ['dough fruit', ['dough fruit', 'dough']],
  ['firefly', ['firefly']], ['sun bloom seed', ['sun bloom seed', 'sun bloom']],
  ['star fruit seed', ['star fruit seed', 'star fruit']], ['seeds', ['seeds', 'sementes', 'semente']],
  ['pets', ['pets', 'pet']], ['gears', ['gears', 'gear', 'equipamentos']],
  ['frutas', ['frutas', 'fruta', 'fruits']], ['gamepasses', ['gamepasses', 'gamepass']], ['pacotes', ['pacotes', 'pacote']]
];

export function extractProductMention(message) {
  const text = normalize(message);
  return PRODUCT_ALIASES.find(([, aliases]) => aliases.some((alias) => matchesWord(text, [normalize(alias)])))?.[0] || '';
}

export const extractOrderCode = (message) => String(message || '').match(/\b(?:THUR|DELIMA)[-_ ]?[A-Z0-9]{3,}\b/i)?.[0]?.replace(/[ _]/g, '-').toUpperCase() || '';

export const detectSupportIntent = (message) => {
  const text = normalize(message);
  if (!text) return 'unknown';
  return INTENT_RULES.find(([, matches]) => matches(text))?.[0] || 'unknown';
};

const RESPONSES = {
  greeting: [
    'Oi! Seja bem-vindo à Delima Blox. Posso te ajudar a encontrar um produto, acompanhar um pedido ou tirar uma dúvida sobre pagamento. O que você quer fazer agora?',
    'Olá! Que bom ter você por aqui. Você precisa de ajuda com compra, Pix, pedido, entrega ou atendimento humano?'
  ],
  buy_product: ['Boa escolha. Vou procurar {product} para você. Se estiver disponível, você poderá adicionar ao carrinho e finalizar no Pix.'],
  ask_price: ['Vou consultar o preço e o estoque de {product} no catálogo para você.'],
  product_search: ['Vou procurar {product} no catálogo da loja. Se estiver disponível, mostro as opções de compra logo abaixo.'],
  payment_pix: ['Para pagar no Pix, finalize o pedido no carrinho. O site mostrará o QR Code e o Pix copia e cola. Depois do pagamento, aguarde a confirmação do pedido.'],
  payment_done: ['Obrigado por avisar. Para agilizar a conferência, envie o código do pedido ou o nome usado na compra. O suporte atualizará o status após verificar o pagamento.'],
  order_status: ['Para localizar seu pedido, envie o código do pedido. Se não tiver o código, informe o nome usado na compra e seu nick Roblox.'],
  delivery_problem: ['Entendi. Vou te ajudar com a entrega. Envie o código do pedido e seu nick Roblox para o suporte localizar sua compra mais rápido.'],
  wrong_nick: ['Sem problema, mas precisamos corrigir antes da entrega. Envie o código do pedido e o nick Roblox correto.'],
  refund: ['Posso registrar sua solicitação para análise. Envie o código do pedido e o motivo do pedido de reembolso; a equipe verificará conforme os termos da loja.'],
  support_human: ['Beleza, vou chamar um atendente humano. Enquanto isso, deixe aqui o máximo de detalhes possível.'],
  security_warning: ['Por segurança, não envie senha, cookie ou código de autenticação. A loja nunca precisa desses dados para atender você.'],
  unknown: ['Entendi. Para eu te ajudar melhor, escolha uma opção: compra, pagamento Pix, pedido, entrega ou falar com atendente.']
};

const shouldShowSecurityWarning = (intent) => ['security_warning', 'payment_pix', 'payment_done', 'delivery_problem', 'wrong_nick'].includes(intent);

export class SmartSupportBotService {
  constructor({ storage = typeof window !== 'undefined' ? window.localStorage : null } = {}) {
    this.storage = storage;
  }

  detectIntent(message) { return detectSupportIntent(message); }
  extractProductMention(message) { return extractProductMention(message); }
  extractOrderCode(message) { return extractOrderCode(message); }

  findLocalOrder(orderCode) {
    if (!orderCode || !this.storage) return null;
    try {
      const parsed = JSON.parse(this.storage.getItem('thur_blox_local_orders') || '{"orders":[]}');
      return (parsed.orders || []).find((order) => String(order.orderCode || '').toUpperCase() === orderCode) || null;
    } catch {
      return null;
    }
  }

  buildBotReply(intent, conversation = {}, message = '') {
    const context = conversation.context || {};
    const product = extractProductMention(message) || context.mentionedProductId || 'esse produto';
    const options = RESPONSES[intent] || RESPONSES.unknown;
    const variantIndex = context.lastIntent === intent ? Number(context.intentRepeatCount || 0) % options.length : 0;
    let reply = options[variantIndex].replace('{product}', product);
    if (intent === 'buy_product' && product === 'esse produto') reply = 'Claro. Qual produto você procura? Posso buscar frutas, gamepasses, seeds, pets, gears ou pacotes no catálogo.';
    const orderCode = extractOrderCode(message) || context.orderCode;
    const order = this.findLocalOrder(orderCode);
    if (order && ['order_status', 'delivery_problem', 'payment_done'].includes(intent)) {
      const paid = ['confirmed', 'paid'].includes(normalize(order.paymentStatus)) || ['paid', 'preparing_delivery', 'delivering', 'delivered'].includes(normalize(order.orderStatus));
      reply += paid ? ' Localizei o pedido: ele já pode ser processado pelo suporte.' : ' Localizei o pedido: ele ainda precisa da confirmação do pagamento.';
    }
    if (shouldShowSecurityWarning(intent) && !context.securityWarningShown && intent !== 'security_warning') {
      reply += ' Lembrete: nunca envie senha, cookie ou código de autenticação.';
    }
    if (reply === context.lastBotReply) reply = `Para complementar: ${reply}`;
    return reply;
  }

  processCustomerMessage(conversation, message, { customerMessageId = '' } = {}) {
    const previous = conversation.context || {};
    if (customerMessageId && previous.processedCustomerMessageIds?.includes(customerMessageId)) return null;
    const intent = detectSupportIntent(message);
    const product = extractProductMention(message);
    const orderCode = extractOrderCode(message);
    const context = {
      ...previous,
      lastIntent: intent,
      mentionedProductId: product || previous.mentionedProductId || '',
      orderCode: orderCode || previous.orderCode || '',
      wantsHumanSupport: previous.wantsHumanSupport === true || intent === 'support_human',
      securityWarningShown: previous.securityWarningShown === true || shouldShowSecurityWarning(intent),
      intentRepeatCount: previous.lastIntent === intent ? Number(previous.intentRepeatCount || 0) + 1 : 0,
      processedCustomerMessageIds: [...(previous.processedCustomerMessageIds || []).slice(-19), customerMessageId].filter(Boolean)
    };
    const body = this.buildBotReply(intent, { ...conversation, context: previous }, message);
    context.lastBotReply = body;
    return { intent, body, context, needsHuman: intent === 'support_human' };
  }
}
