export const SUPPORT_STORAGE_KEY = 'thur_blox_support_store_v1';
export const SUPPORT_ACTIVE_CONVERSATION_KEY = 'thur_blox_support_active_conversation';
export const SUPPORT_CUSTOMER_PROFILE_KEY = 'thur_blox_support_customer_profile';
export const SUPPORT_MESSAGE_MAX_LENGTH = 1000;

export const SUPPORT_STATUS_LABELS = {
  new: 'Novo',
  awaiting_admin: 'Aguardando resposta',
  responded: 'Respondido',
  closed: 'Fechado'
};

export const INITIAL_SUPPORT_MESSAGE = 'Olá! Eu sou o Assistente Delima, seu suporte virtual da loja. Posso te ajudar com compra, pagamento Pix, pedido, entrega, produtos ou falar com um atendente. O que você precisa?';
export const getSupportBotReply = (message) => {
  const bot = new SmartSupportBotService({ storage: null });
  const intent = bot.detectIntent(message);
  return bot.buildBotReply(intent, {}, message);
};

const nowIso = () => new Date().toISOString();

export const isActiveSupportConversation = (conversation = {}) => conversation.status !== 'closed'
  && conversation.archived !== true
  && conversation.deleted !== true;

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
  constructor({ storage = getDefaultStorage(), now = nowIso, botService = null } = {}) {
    this.storage = storage;
    this.now = now;
    this.botService = botService || new SmartSupportBotService({ storage });
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
      senderName: 'Assistente Delima',
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
      needsHuman: false,
      context: {
        lastIntent: 'greeting',
        mentionedProductId: '',
        orderCode: '',
        wantsHumanSupport: false,
        securityWarningShown: false,
        processedCustomerMessageIds: []
      },
      messages: [greeting]
    };
    const state = this.loadState();
    state.conversations.unshift(conversation);
    this.saveState(state);
    this.setActiveConversationId(id);
    return conversation;
  }

  sendMessage(conversationId, { senderType = 'customer', senderName = '', body, product = null, messageType = '' } = {}) {
    const messageBody = normalizeText(body, { required: true, label: 'Mensagem' });
    const sender = senderType === 'admin' ? 'admin' : senderType === 'system' ? 'system' : senderType === 'bot' ? 'bot' : 'customer';
    const createdAt = this.now();
    const message = this.buildMessage({
      conversationId,
      senderType: sender,
      senderName: normalizeText(senderName, { max: 120, label: 'Remetente' }),
      body: messageBody,
      createdAt,
      product,
      messageType
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
      const result = this.botService.processCustomerMessage(conversation, messageBody, { customerMessageId: message.id });
      if (result) {
        message.intent = result.intent;
        conversation.context = result.context;
        conversation.needsHuman = conversation.needsHuman === true || result.needsHuman;
        conversation.messages.push(this.buildMessage({
          conversationId,
          senderType: 'bot',
          senderName: 'Assistente Delima',
          body: result.body,
          createdAt,
          messageType: 'smart_bot_reply',
          intent: result.intent
        }));
      }
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
    return this.updateStatus(conversationId, 'closed', {
      archived: true,
      archivedAt: this.now()
    });
  }

  getCustomerProfile() {
    if (!this.storage) return null;
    try {
      const profile = JSON.parse(this.storage.getItem(SUPPORT_CUSTOMER_PROFILE_KEY) || 'null');
      if (!profile?.name) return null;
      return {
        name: String(profile.name).trim(),
        email: String(profile.email || '').trim(),
        robloxNick: String(profile.robloxNick || '').trim(),
        createdAt: profile.createdAt || this.now(),
        updatedAt: profile.updatedAt || profile.createdAt || this.now()
      };
    } catch {
      return null;
    }
  }

  saveCustomerProfile({ name, email = '', robloxNick = '' } = {}) {
    const current = this.getCustomerProfile();
    const profile = {
      name: normalizeText(name, { required: true, max: 120, label: 'Nome' }),
      email: normalizeText(email, { max: 160, label: 'Email' }),
      robloxNick: normalizeText(robloxNick, { max: 80, label: 'Nick Roblox' }),
      createdAt: current?.createdAt || this.now(),
      updatedAt: this.now()
    };
    this.storage?.setItem(SUPPORT_CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
    return profile;
  }

  updateCustomerProfile(input = {}) {
    const profile = this.saveCustomerProfile(input);
    const activeId = this.getActiveConversationId();
    if (!activeId) return profile;
    const state = this.loadState();
    const conversation = state.conversations.find((item) => item.id === activeId);
    if (conversation) {
      conversation.customerName = profile.name;
      conversation.customerEmail = profile.email;
      conversation.robloxUsername = profile.robloxNick;
      conversation.updatedAt = profile.updatedAt;
      this.saveState(state);
    }
    return profile;
  }

  createConversationFromProfile() {
    const profile = this.getCustomerProfile();
    if (!profile) return null;
    return this.createConversation({
      customerName: profile.name,
      customerEmail: profile.email,
      robloxUsername: profile.robloxNick
    });
  }

  updateStatus(conversationId, status, changes = {}) {
    if (!SUPPORT_STATUS_LABELS[status]) throw new Error('Status invalido.');
    const state = this.loadState();
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversa nao encontrada.');
    Object.assign(conversation, changes, { status });
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

  listActiveAdminConversations() {
    return this.listAdminConversations().filter(isActiveSupportConversation);
  }

  clearActiveConversation() {
    if (!this.storage) return;
    this.storage.removeItem(SUPPORT_ACTIVE_CONVERSATION_KEY);
  }

  getCustomerUnreadCount() {
    const conversation = this.getActiveConversation();
    return Number(conversation?.unreadByCustomer || 0);
  }

  getAdminUnreadCount() {
    return this.listActiveAdminConversations().reduce((total, conversation) => total + Number(conversation.unreadByAdmin || 0), 0);
  }

  buildMessage({ conversationId, senderType, senderName, body, createdAt, product = null, messageType = '', intent = '' }) {
    return {
      id: createId('msg'),
      conversationId,
      senderType,
      sender: senderType,
      senderName,
      body,
      text: body,
      read: senderType === 'bot',
      createdAt,
      ...(product ? { product } : {}),
      ...(messageType ? { messageType } : {}),
      ...(intent ? { intent } : {})
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
import { SmartSupportBotService } from './SmartSupportBotService.js';
