export const SUPPORT_STORAGE_KEY = 'thur_blox_support_store_v1';
export const SUPPORT_ACTIVE_CONVERSATION_KEY = 'thur_blox_support_active_conversation';
export const SUPPORT_MESSAGE_MAX_LENGTH = 1000;

export const SUPPORT_STATUS_LABELS = {
  new: 'Novo',
  awaiting_admin: 'Aguardando resposta',
  responded: 'Respondido',
  closed: 'Fechado'
};

const INITIAL_SUPPORT_MESSAGE = 'Olá! 👋 Eu sou o assistente da Thur Blox. Como posso ajudar você?';

const BOT_REPLIES = {
  payment: 'Obrigado pelo aviso! Se você já realizou o pagamento via Pix, aguarde a confirmação do pedido. Não envie dados sensíveis como senha, cookie ou código de autenticação.',
  order: 'Para ajudar mais rápido, envie o código do pedido e seu nick do Roblox. Assim a equipe consegue localizar sua compra.',
  problem: 'Entendi. Registrei seu problema. Envie mais detalhes ou print, se possível, para a equipe verificar melhor.',
  greeting: 'Olá! Seja bem-vindo ao suporte da Thur Blox. Me diga como posso ajudar.',
  fallback: 'Mensagem recebida! Nossa equipe vai responder assim que possível.'
};

const normalizeForBot = (value) => String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const getSupportBotReply = (message) => {
  const text = normalizeForBot(message);
  if (['pix', 'paguei', 'pagamento', 'qr code', 'copia e cola', 'comprovante'].some((keyword) => text.includes(keyword))) return BOT_REPLIES.payment;
  if (['pedido', 'entrega', 'entregar', 'recebi', 'nao chegou', 'produto'].some((keyword) => text.includes(keyword))) return BOT_REPLIES.order;
  if (['erro', 'bug', 'problema', 'nao consigo', 'falhou', 'travou'].some((keyword) => text.includes(keyword))) return BOT_REPLIES.problem;
  if (['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'].some((keyword) => new RegExp(`(^|\\s)${keyword}(\\s|[!,.?]|$)`).test(text))) return BOT_REPLIES.greeting;
  return BOT_REPLIES.fallback;
};

const nowIso = () => new Date().toISOString();

const createId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeText = (value, { required = false, max = SUPPORT_MESSAGE_MAX_LENGTH, label = 'Texto' } = {}) => {
  const text = String(value || '').trim();
  if (required && !text) throw new Error(`${label} e obrigatorio.`);
  if (text.length > max) throw new Error(`${label} deve ter no maximo ${max} caracteres.`);
  return text;
};

const getDefaultStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
};

export class SupportService {
  constructor({ storage = getDefaultStorage(), now = nowIso } = {}) {
    this.storage = storage;
    this.now = now;
  }

  createConversation({ customerName, customerEmail = '', robloxUsername = '', orderContext = null } = {}) {
    const name = normalizeText(customerName, { required: true, max: 120, label: 'Nome' });
    const email = normalizeText(customerEmail, { max: 160, label: 'Email' });
    const roblox = normalizeText(robloxUsername, { max: 80, label: 'Nick Roblox' });
    const createdAt = this.now();
    const id = createId('support');
    const greeting = this.buildMessage({
      conversationId: id,
      senderType: 'bot',
      senderName: 'Assistente Thur Blox',
      body: INITIAL_SUPPORT_MESSAGE,
      createdAt
    });
    const conversation = {
      id,
      customerName: name,
      customerEmail: email,
      robloxUsername: roblox,
      orderContext,
      status: 'new',
      createdAt,
      updatedAt: createdAt,
      lastMessageAt: createdAt,
      unreadByAdmin: 0,
      unreadByCustomer: 0,
      messages: [greeting]
    };
    const state = this.loadState();
    state.conversations.unshift(conversation);
    this.saveState(state);
    this.setActiveConversationId(id);
    return conversation;
  }

  sendMessage(conversationId, { senderType = 'customer', senderName = '', body } = {}) {
    const messageBody = normalizeText(body, { required: true, label: 'Mensagem' });
    const sender = senderType === 'admin' ? 'admin' : senderType === 'system' ? 'system' : senderType === 'bot' ? 'bot' : 'customer';
    const createdAt = this.now();
    const message = this.buildMessage({
      conversationId,
      senderType: sender,
      senderName: normalizeText(senderName, { max: 120, label: 'Remetente' }),
      body: messageBody,
      createdAt
    });
    const state = this.loadState();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversa nao encontrada.');
    if (conversation.status === 'closed') throw new Error('Esta conversa ja foi fechada.');

    conversation.messages.push(message);
    conversation.updatedAt = createdAt;
    conversation.lastMessageAt = createdAt;
    if (sender === 'admin') {
      conversation.status = 'responded';
      conversation.unreadByCustomer = Number(conversation.unreadByCustomer || 0) + 1;
    } else if (sender === 'customer') {
      conversation.status = conversation.messages.some((item) => item.senderType === 'admin') ? 'awaiting_admin' : 'new';
      conversation.unreadByAdmin = Number(conversation.unreadByAdmin || 0) + 1;
      conversation.messages.push(this.buildMessage({
        conversationId,
        senderType: 'bot',
        senderName: 'Assistente Thur Blox',
        body: getSupportBotReply(messageBody),
        createdAt
      }));
    }
    this.saveState(state);
    return message;
  }

  replyAsAdmin(conversationId, body, senderName = 'Admin Thur Blox') {
    return this.sendMessage(conversationId, {
      senderType: 'admin',
      senderName,
      body
    });
  }

  markAsRead(conversationId, readerType) {
    const state = this.loadState();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return null;
    if (readerType === 'admin') conversation.unreadByAdmin = 0;
    if (readerType === 'customer') conversation.unreadByCustomer = 0;
    conversation.updatedAt = this.now();
    this.saveState(state);
    return conversation;
  }

  markResolved(conversationId) {
    return this.updateStatus(conversationId, 'responded');
  }

  closeConversation(conversationId) {
    return this.updateStatus(conversationId, 'closed');
  }

  updateStatus(conversationId, status) {
    if (!SUPPORT_STATUS_LABELS[status]) throw new Error('Status invalido.');
    const state = this.loadState();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversa nao encontrada.');
    conversation.status = status;
    conversation.updatedAt = this.now();
    this.saveState(state);
    return conversation;
  }

  listAdminConversations() {
    return this.loadState().conversations
      .slice()
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  getConversation(conversationId) {
    return this.loadState().conversations.find((item) => item.id === conversationId) || null;
  }

  getConversationMessages(conversationId) {
    return this.getConversation(conversationId)?.messages || [];
  }

  getActiveConversation() {
    const activeId = this.getActiveConversationId();
    return activeId ? this.getConversation(activeId) : null;
  }

  getActiveConversationId() {
    if (!this.storage) return '';
    return this.storage.getItem(SUPPORT_ACTIVE_CONVERSATION_KEY) || '';
  }

  setActiveConversationId(conversationId) {
    if (!this.storage) return;
    this.storage.setItem(SUPPORT_ACTIVE_CONVERSATION_KEY, conversationId);
  }

  getCustomerUnreadCount() {
    const conversation = this.getActiveConversation();
    return Number(conversation?.unreadByCustomer || 0);
  }

  getAdminUnreadCount() {
    return this.listAdminConversations().reduce((total, conversation) => total + Number(conversation.unreadByAdmin || 0), 0);
  }

  buildMessage({ conversationId, senderType, senderName, body, createdAt }) {
    return {
      id: createId('msg'),
      conversationId,
      senderType,
      sender: senderType,
      senderName,
      body,
      text: body,
      read: senderType === 'bot',
      createdAt
    };
  }

  loadState() {
    if (!this.storage) return { conversations: [] };
    try {
      const parsed = JSON.parse(this.storage.getItem(SUPPORT_STORAGE_KEY) || '{}');
      if (!parsed || !Array.isArray(parsed.conversations)) return { conversations: [] };
      return {
        conversations: parsed.conversations.map((conversation) => ({
          ...conversation,
          messages: Array.isArray(conversation.messages) ? conversation.messages : [],
          unreadByAdmin: Number(conversation.unreadByAdmin || 0),
          unreadByCustomer: Number(conversation.unreadByCustomer || 0)
        }))
      };
    } catch {
      return { conversations: [] };
    }
  }

  saveState(state) {
    if (!this.storage) return;
    this.storage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify({
      conversations: Array.isArray(state.conversations) ? state.conversations : []
    }));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('thur-blox-support-updated'));
    }
  }
}
