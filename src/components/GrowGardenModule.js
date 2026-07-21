import { createElement } from './ui-utils.js';
import { SeedDataService } from '../services/grow-garden-2/SeedDataService.js';
import {
  StoreCommerceService,
  calculateCouponDiscountInCents,
  calculateSubtotalInCents,
  formatMoney,
  normalizeCouponCode,
  validateRobloxUsername
} from '../services/grow-garden-2/StoreCommerceService.js';
import { LocalOrderRepository } from '../services/grow-garden-2/LocalOrderRepository.js';
import { CartService } from '../services/grow-garden-2/CartService.js';
import { STORE_COMMERCE_CONFIG } from '../config/store-commerce-config.js';
import { SupportService, SUPPORT_STATUS_LABELS } from '../services/SupportService.js';
import { AuthService } from '../services/AuthService.js';
import { renderPixQrCode } from '../services/PixQrCodeService.js';
import {
  InventoryOverrideService,
  STOCK_STATUS,
  normalizeStockState,
  normalizeStockStatusValue
} from '../services/InventoryOverrideService.js';
import { CouponAdminService } from '../services/CouponAdminService.js';
import { SupportChatWidget } from './SupportChatWidget.js';

const DEFAULT_ORDER_API_URL = '/api/store/orders';
const ORDER_API_PATH = '/store/orders';
const SUPPORT_BOT_AVATAR = '/assets/support/delima-blox-support-bot.png';
const SUPPORT_ADMIN_AVATAR = '/assets/support/delima-blox-support-admin.png';

const ORDER_ERROR_MESSAGES = {
  API_NOT_CONFIGURED: 'O servico de pedidos ainda nao foi configurado.',
  API_OFFLINE: 'O servico de pedidos esta temporariamente indisponivel.',
  CORS_ERROR: 'O navegador bloqueou a comunicacao com o servico de pedidos.',
  ORDER_API_ERROR: 'Servico de pedidos indisponivel. Tente novamente.',
  LOCAL_STORAGE_ERROR: 'Nao foi possivel salvar o pedido.',
  PRODUCT_NOT_FOUND: 'Produto nao encontrado.',
  SALE_DISABLED: 'Este produto ainda nao esta disponivel para venda.',
  INVALID_PRODUCT_PRICE: 'O preco deste produto ainda nao foi configurado.',
  OUT_OF_STOCK: 'Produto sem estoque.',
  INVALID_QUANTITY: 'Quantidade invalida.',
  INVALID_ROBLOX_USERNAME: 'Confira o nick do Roblox.',
  CUSTOMER_NAME_REQUIRED: 'Informe o nome do cliente.',
  TERMS_NOT_ACCEPTED: 'Aceite os termos para continuar.',
  COMMERCE_DISABLED: 'Checkout temporariamente indisponivel.',
  AUTH_REQUIRED: 'O pedido ainda esta exigindo login indevidamente.',
  DATABASE_ERROR: 'Nao foi possivel salvar o pedido.',
  ORDER_STORAGE_ERROR: 'Nao foi possivel salvar o pedido.',
  NETWORK_ERROR: 'Nao foi possivel conectar ao servico de pedidos.',
  INVALID_COUPON: 'Cupom invalido ou expirado.'
};

const PIX_ERROR_MESSAGES = {
  PIX_CONFIGURATION_MISSING: 'A configuracao Pix ainda esta incompleta.',
  PIX_RECEIVER_NAME_MISSING: 'Nome do recebedor Pix nao configurado.',
  PIX_RECEIVER_CITY_MISSING: 'Cidade do recebedor Pix nao configurada.',
  PIX_GATEWAY_OFFLINE: 'O servico Pix esta temporariamente indisponivel.',
  PIX_GATEWAY_AUTH_ERROR: 'Falha na autenticacao com o provedor Pix.',
  PIX_PAYLOAD_ERROR: 'Nao foi possivel gerar o codigo Pix.',
  PIX_QR_ERROR: 'Nao foi possivel gerar o QR Code.',
  DUPLICATE_PAYMENT: 'Ja existe uma cobranca ativa para este pedido.',
  ORDER_NOT_FOUND: 'Pedido nao encontrado.',
  ORDER_ALREADY_PAID: 'Pedido ja pago.'
};

const mapOrderError = (error) => {
  if (error?.code && ORDER_ERROR_MESSAGES[error.code]) return ORDER_ERROR_MESSAGES[error.code];
  return error?.message || 'Erro ao criar pedido. Verifique os dados e tente novamente.';
};

const mapPixError = (error) => {
  if (error?.code && PIX_ERROR_MESSAGES[error.code]) return PIX_ERROR_MESSAGES[error.code];
  return error?.message || 'Nao foi possivel gerar a cobranca Pix.';
};

class OrderServiceError extends Error {
  constructor(code, message, { status = 0, response = null, responseText = '', contentType = '', url = '' } = {}) {
    super(message || code);
    this.name = 'OrderServiceError';
    this.code = code;
    this.status = status;
    this.response = response;
    this.responseText = responseText;
    this.contentType = contentType;
    this.url = url;
  }
}

export class GrowGardenModule {
  constructor({ root, onNavigate, initialTab = 'sementes', initialAdminPanelTab = 'support', adminSession = null, authService = new AuthService() }) {
    this.root = root;
    this.onNavigate = onNavigate;
    this.authService = authService;
    this.adminSession = adminSession || this.authService.getSession();
    this.activeTab = initialTab === 'admin' && !this.authService.isAdminSession(this.adminSession) ? 'sementes' : initialTab;
    this.currentUser = this.authService.getCurrentUser();
    this.selectedSeedSlug = null;
    this.checkoutStateBySeed = new Map();
    this.pendingPixScrollSlug = null;
    this.manualOrders = [];
    this.seeds = [];
    this.storeProducts = [];
    this.storeCategoryFilter = 'all';
    this.storeStockFilter = 'all';
    this.storeSort = 'featured';
    this.storeSearch = '';
    this.cartItems = [];
    this.cartState = {
      customerName: this.currentUser?.name || '',
      robloxUsername: this.currentUser?.robloxUsername || '',
      robloxDisplayName: '',
      email: this.currentUser?.email || '',
      couponCode: '',
      appliedCouponCode: '',
      discountInCents: 0,
      couponMessage: '',
      couponStatus: '',
      termsAccepted: false,
      message: '',
      messageStatus: '',
      order: null,
      copyMessage: ''
    };
    this.adminAccess = {
      authorized: this.authService.isAdminSession(this.adminSession),
      modalOpen: false,
      email: this.adminSession?.email || '',
      password: '',
      passwordVisible: false,
      loading: false,
      error: ''
    };
    this.adminPanelTab = initialAdminPanelTab;
    this.coupons = [];
    this.loading = true;
    this.error = null;
    this.seedDataService = new SeedDataService();
    this.storeCommerceService = new StoreCommerceService();
    this.localOrderRepository = new LocalOrderRepository();
    this.supportService = new SupportService();
    this.inventoryOverrideService = new InventoryOverrideService();
    this.couponAdminService = new CouponAdminService();
    this.selectedSupportConversationId = null;
    this.supportAdminMessage = '';
    this.adminStockDrafts = {};
    this.adminStockErrors = {};
    this.adminStockSaving = false;
    this.adminStockSavingSlug = '';
    this.adminStockBeforeUnload = (event) => {
      if (this.getAdminStockDirtyCount() === 0) return;
      event.preventDefault();
      event.returnValue = 'Voce possui alteracoes nao salvas.';
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.adminStockBeforeUnload);
    }
    this.editingCouponId = '';
    this.cartService = new CartService({ getProductBySlug: (productSlug) => this.getCartProduct(productSlug) });
    this.cartItems = this.cartService.load();

    this.init();
  }

  async init() {
    try {
      const seeds = await this.seedDataService.getAll();
      this.seeds = await this.storeCommerceService.getCatalog(seeds);
      this.storeProducts = this.inventoryOverrideService.applyToProducts(await this.storeCommerceService.getStoreCatalog());
      this.cartItems = this.cartService.save(this.cartItems);
      this.coupons = await this.storeCommerceService.loadCoupons();
      await this.loadUserOrders();
    } catch (error) {
      this.error = String(error.message || error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    let container;
    try {
      container = createElement('div', { class: 'grow-garden-module' }, [
        this.buildHeader(),
        ['checkout', 'admin'].includes(this.activeTab) ? null : this.buildTabs(),
        this.buildContent(),
        this.adminAccess.modalOpen ? this.buildAdminAccessModal() : null,
        new SupportChatWidget({ service: this.supportService }).render()
      ]);
    } catch (error) {
      console.error('GROW_GARDEN_RENDER_ERROR', {
        activeTab: this.activeTab,
        message: error?.message || String(error),
        stack: error?.stack || null
      });
      container = this.buildRenderFallback(error);
    }
    this.root.replaceChildren(container);
    this.scrollToPendingPix();
  }

  buildRenderFallback(error) {
    const failedTab = this.activeTab;
    const fallback = createElement('div', { class: 'grow-garden-module' }, [
      this.buildHeader(),
      ['checkout', 'admin'].includes(failedTab) ? null : this.buildTabs(),
      createElement('section', { class: 'garden-content' }, [
        createElement('section', { class: 'cart-screen garden-empty panel' }, [
          createElement('h2', {}, failedTab === 'carrinho' ? 'Nao foi possivel carregar o carrinho.' : 'Nao foi possivel carregar esta tela.'),
          createElement('p', {}, 'Tente novamente ou volte para a loja.'),
          createElement('div', { class: 'cart-panel-actions' }, [
            createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'retry-render' }, 'Tentar novamente'),
            createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'back-store' }, 'Voltar a loja')
          ])
        ])
      ]),
      new SupportChatWidget({ service: this.supportService }).render()
    ]);
    fallback.querySelector('[data-action="retry-render"]').addEventListener('click', () => this.render());
    fallback.querySelector('[data-action="back-store"]').addEventListener('click', () => {
      this.activeTab = 'sementes';
      this.render();
    });
    if (error && STORE_COMMERCE_CONFIG.commerceEnabled !== true) {
      fallback.setAttribute('data-render-error', error?.message || String(error));
    }
    return fallback;
  }

  buildHeader() {
    const header = createElement('header', { class: 'portal-topbar garden-header' }, [
      createElement('div', { class: 'portal-brand garden-brand' }, [
        createElement('button', { type: 'button', class: 'garden-back-button', 'data-action': 'go-home', 'aria-label': 'Voltar ao portal' }, ''),
        createElement('div', { class: 'garden-brand-copy' }, [
          createElement('strong', {}, 'Grow a Garden 2'),
          createElement('small', {}, 'Loja de seeds, pets e gears')
        ])
      ]),
      createElement('div', { class: 'garden-header-actions' }, [
        this.buildStatusBadge()
      ])
    ]);
    header.querySelectorAll('[data-action="go-home"]').forEach((button) => {
      button.addEventListener('click', () => this.onNavigate('home'));
    });
    return header;
  }

  buildHero() {
    const hero = createElement('section', { class: 'garden-hero panel' }, [
      createElement('div', { class: 'garden-hero-copy' }, [
        createElement('span', { class: 'garden-kicker' }, 'Grow a Garden 2'),
        createElement('h1', {}, 'Encontre seeds, pets e gears'),
        createElement('p', {}, 'Escolha seus itens, aplique cupons e prepare seu pedido via Pix em uma loja compacta, segura e organizada.'),
        createElement('div', { class: 'garden-hero-actions' }, [
          createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'see-store' }, 'Explorar loja'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'see-catalog' }, 'Ver catalogo')
        ])
      ]),
      createElement('div', { class: 'garden-hero-art' }, [
        createElement('div', { class: 'garden-showcase' }, [
          createElement('span', { class: 'garden-orbit seed' }, 'Seed'),
          createElement('span', { class: 'garden-orbit pet' }, 'Pet'),
          createElement('span', { class: 'garden-orbit gear' }, 'Gear'),
          this.buildStoreStatusCard()
        ])
      ])
    ]);
    hero.querySelector('[data-action="see-store"]').addEventListener('click', () => {
      this.activeTab = 'sementes';
      this.render();
    });
    hero.querySelector('[data-action="see-catalog"]').addEventListener('click', () => {
      this.activeTab = 'catalogo';
      this.render();
    });
    return hero;
  }

  buildTabs() {
    const tabs = createElement('nav', { class: 'garden-tabs' });
    const cartCount = this.getCartCount();
    const navigationItems = [
      { id: 'inicio', label: 'Inicio', icon: 'home' },
      { id: 'sementes', label: 'Loja', icon: 'store' },
      { id: 'carrinho', label: `Carrinho (${cartCount})`, icon: 'cart' },
      { id: 'catalogo', label: 'Catalogo seeds', icon: 'seed' },
      { id: 'mais', label: 'Mais', icon: 'more' }
    ];

    navigationItems.forEach(({ id: tab, label, icon }) => {
      const button = createElement('button', {
        type: 'button',
        class: `tab-button ${this.activeTab === tab ? 'active' : ''}`,
        'aria-label': label
      }, [
        createElement('span', { class: 'nav-icon', 'data-icon': icon, 'aria-hidden': 'true' }, ''),
        createElement('span', { class: 'nav-label' }, label)
      ]);
      button.addEventListener('click', async () => {
        this.activeTab = tab;
        this.selectedSeedSlug = null;
        this.checkoutStateBySeed.clear();
        this.render();
      });
      tabs.append(button);
    });
    return tabs;
  }

  buildContent() {
    const content = createElement('section', { class: 'garden-content' });
    if (this.activeTab === 'inicio') {
      content.append(this.buildStoreSection());
    } else if (this.activeTab === 'sementes') {
      content.append(this.buildStoreSection());
    } else if (this.activeTab === 'checkout') {
      content.append(this.buildCheckoutView());
    } else if (this.activeTab === 'carrinho') {
      content.append(this.buildCartView());
    } else if (this.activeTab === 'catalogo') {
      content.append(this.buildInformativeSeedsSection());
    } else if (this.activeTab === 'admin') {
      content.append(this.buildAdminSection());
    } else {
      content.append(this.buildMoreSection());
    }
    return content;
  }

  buildWelcomeSection() {
    const available = this.storeProducts.filter((product) => !this.isSoldOut(product));
    const deals = this.storeProducts
      .filter((product) => Number.isInteger(product.discountPercent))
      .slice(0, 3);
    const section = createElement('div', { class: 'garden-home-grid' }, [
      createElement('section', { class: 'garden-welcome panel' }, [
        createElement('span', { class: 'garden-kicker' }, 'Destaques da loja'),
        createElement('h2', {}, 'Itens prontos para pedido Pix'),
        createElement('p', {}, `${available.length} produtos disponiveis entre seeds, pets, gears e pacotes. Tudo separado do catalogo informativo do jogo.`),
        createElement('div', { class: 'garden-welcome-actions' }, [
          createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'explore-seeds' }, 'Explorar loja'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'go-catalog' }, 'Ver catalogo')
        ])
      ]),
      createElement('section', { class: 'garden-category-grid' }, this.getStoreCategories().map((category) => this.buildCategoryCard(category))),
      createElement('section', { class: 'garden-section-card panel' }, [
        createElement('div', { class: 'section-heading' }, [
          createElement('div', {}, [
            createElement('span', { class: 'garden-kicker' }, 'Promocoes'),
            createElement('h2', {}, 'Ofertas em destaque')
          ]),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'explore-deals' }, 'Ver loja')
        ]),
        createElement('div', { class: 'deal-strip' }, deals.map((product) => createElement('article', { class: 'deal-card' }, [
          createElement('strong', {}, product.name),
          createElement('span', {}, `${product.discountPercent}% OFF`),
          createElement('b', {}, formatMoney(product.salePriceInCents, product.currency || 'BRL'))
        ])))
      ]),
      createElement('section', { class: 'garden-section-card panel' }, [
        createElement('div', { class: 'section-heading' }, [
          createElement('div', {}, [
            createElement('span', { class: 'garden-kicker' }, 'Como comprar'),
            createElement('h2', {}, 'Fluxo simples e manual')
          ])
        ]),
        createElement('div', { class: 'how-to-grid' }, [
          this.buildInfoStep('1', 'Escolha o item', 'Abra a loja, filtre por categoria e confira preco Pix.'),
          this.buildInfoStep('2', 'Preencha os dados', 'Informe nome, nick Roblox, quantidade e cupom se tiver.'),
          this.buildInfoStep('3', 'Pague via Pix', 'O pedido fica aguardando confirmacao e entrega manual.')
        ])
      ])
    ]);
    section.querySelector('[data-action="explore-seeds"]').addEventListener('click', () => {
      this.activeTab = 'sementes';
      this.render();
    });
    section.querySelector('[data-action="go-catalog"]').addEventListener('click', () => {
      this.activeTab = 'catalogo';
      this.render();
    });
    section.querySelector('[data-action="explore-deals"]').addEventListener('click', () => {
      this.activeTab = 'sementes';
      this.storeStockFilter = 'deals';
      this.render();
    });
    section.querySelectorAll('[data-category]').forEach((card) => {
      card.addEventListener('click', () => {
        this.activeTab = 'sementes';
        this.storeCategoryFilter = card.getAttribute('data-category');
        this.render();
      });
    });
    return section;
  }

  buildStatusBadge() {
    const active = STORE_COMMERCE_CONFIG.commerceEnabled === true;
    return createElement('span', { class: `store-status-badge ${active ? 'active' : 'offline'}` }, [
      createElement('span', { class: 'status-dot' }, ''),
      createElement('span', {}, active ? 'Loja ativa' : 'Checkout indisponivel')
    ]);
  }

  buildStoreStatusCard() {
    return createElement('div', { class: 'garden-status-card' }, [
      createElement('span', { class: 'garden-kicker' }, 'Status da loja'),
      createElement('h2', {}, STORE_COMMERCE_CONFIG.commerceEnabled ? 'Venda ativa' : 'Checkout indisponivel'),
      createElement('p', {}, STORE_COMMERCE_CONFIG.commerceEnabled
        ? 'Pedidos via Pix manual com status de pagamento pendente ate confirmacao.'
        : 'Checkout indisponivel no momento.'),
      createElement('div', { class: 'status-metrics' }, [
        this.buildStatusMetric('Pix', STORE_COMMERCE_CONFIG.pix?.mode || 'manual'),
        this.buildStatusMetric('Produtos', String(this.storeProducts.length || 0))
      ])
    ]);
  }

  buildStatusMetric(label, value) {
    return createElement('span', {}, [
      createElement('small', {}, label),
      createElement('strong', {}, value)
    ]);
  }

  buildCategoryCard(category) {
    const count = this.storeProducts.filter((product) => product.category === category.key).length;
    const label = this.formatCategory(category.key);
    const descriptions = {
      seeds: 'Sementes e itens unitarios',
      pets: 'Companheiros raros para evoluir',
      gears: 'Itens de apoio para o jardim',
      packages: 'Combos e ofertas especiais'
    };
    return createElement('button', {
      type: 'button',
      class: 'category-card',
      'data-category': category.key
    }, [
      createElement('span', { class: 'category-icon', 'aria-hidden': 'true' }, ''),
      createElement('strong', {}, label),
      createElement('small', {}, descriptions[category.key] || 'Itens digitais'),
      createElement('b', {}, `${count} itens`)
    ]);
  }

  buildInfoStep(number, title, text) {
    return createElement('article', { class: 'info-step' }, [
      createElement('span', {}, number),
      createElement('strong', {}, title),
      createElement('p', {}, text)
    ]);
  }

  async loadUserOrders() {
    if (this.isLocalOrderStorageMode()) {
      if (this.adminAccess.authorized) {
        this.manualOrders = this.localOrderRepository.list();
      }
      return;
    }
    const response = await fetch('/api/admin/orders', { credentials: 'include', cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      this.adminAccess.authorized = false;
      return;
    }
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    this.adminAccess.authorized = true;
    this.manualOrders = Array.isArray(data.orders) ? data.orders : [];
  }

  openAdminAccessModal() {
    this.adminAccess.modalOpen = true;
    this.adminAccess.email = this.adminSession?.email || '';
    this.adminAccess.password = '';
    this.adminAccess.passwordVisible = false;
    this.adminAccess.loading = false;
    this.adminAccess.error = '';
    this.render();
    window.setTimeout(() => this.root.querySelector('[data-admin-password]')?.focus(), 0);
  }

  closeAdminAccessModal() {
    this.adminAccess.modalOpen = false;
    this.adminAccess.password = '';
    this.adminAccess.loading = false;
    this.adminAccess.error = '';
    this.render();
  }

  async verifyAdminAccess() {
    this.adminAccess.loading = true;
    this.adminAccess.error = '';
    this.render();
    try {
      const session = await this.authService.login({
        email: this.adminAccess.email,
        password: this.adminAccess.password
      });
      if (this.authService.isAdminSession(session)) {
        this.adminAccess.authorized = true;
        this.adminAccess.email = session.email;
        this.adminAccess.modalOpen = false;
        this.adminAccess.password = '';
        this.adminSession = session;
        this.activeTab = 'admin';
        if (this.isLocalOrderStorageMode()) {
          this.manualOrders = this.localOrderRepository.list();
        } else {
          await this.loadUserOrders();
        }
        return;
      }
      const response = await fetch('/api/admin/access', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.adminAccess.email, password: this.adminAccess.password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.authorized !== true) {
        this.adminAccess.loading = false;
        this.adminAccess.error = data.error || 'Senha invalida.';
        this.render();
        return;
      }
      this.authService.saveSession({
        role: 'admin',
        email: data.email || this.adminAccess.email,
        name: data.email || this.adminAccess.email,
        robloxUsername: '',
        expiresAt: Date.now() + (Number(data.expiresInSeconds || 1800) * 1000)
      });
      this.adminAccess.authorized = true;
      this.adminAccess.email = data.email || this.adminAccess.email;
      this.adminAccess.modalOpen = false;
      this.adminAccess.password = '';
      this.activeTab = 'admin';
      if (this.isLocalOrderStorageMode()) {
        this.manualOrders = this.localOrderRepository.list();
      } else {
        await this.loadUserOrders();
      }
    } catch {
      this.adminAccess.error = 'Nao foi possivel validar o acesso.';
    } finally {
      this.adminAccess.loading = false;
      this.render();
    }
  }

  buildAdminAccessModal() {
    const overlay = createElement('div', { class: 'access-modal-overlay' }, [
      createElement('form', { class: 'access-modal panel' }, [
        createElement('h2', {}, 'Acesso administrativo'),
        createElement('label', { class: 'checkout-field' }, [
          createElement('span', {}, 'E-mail'),
          createElement('input', {
            type: 'email',
            value: this.adminAccess.email,
            autocomplete: 'email',
            'data-admin-email': 'true'
          })
        ]),
        createElement('label', { class: 'checkout-field' }, [
          createElement('span', {}, 'Senha'),
          createElement('input', {
            type: this.adminAccess.passwordVisible ? 'text' : 'password',
            value: this.adminAccess.password,
            autocomplete: 'current-password',
            'data-admin-password': 'true'
          })
        ]),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'toggle-admin-password' }, this.adminAccess.passwordVisible ? 'Ocultar' : 'Mostrar'),
        this.adminAccess.error ? createElement('p', { class: 'checkout-message error' }, this.adminAccess.error) : null,
        createElement('div', { class: 'checkout-actions' }, [
          createElement('button', { type: 'submit', class: 'button-primary', disabled: this.adminAccess.loading ? 'disabled' : null }, this.adminAccess.loading ? 'Validando...' : 'Entrar'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'cancel-admin-access' }, 'Cancelar')
        ])
      ])
    ]);

    overlay.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.verifyAdminAccess();
    });
    overlay.querySelector('[data-admin-email]').addEventListener('input', (event) => {
      this.adminAccess.email = event.target.value;
    });
    overlay.querySelector('[data-admin-password]').addEventListener('input', (event) => {
      this.adminAccess.password = event.target.value;
    });
    overlay.querySelector('[data-action="toggle-admin-password"]').addEventListener('click', (event) => {
      event.preventDefault();
      this.adminAccess.passwordVisible = !this.adminAccess.passwordVisible;
      const input = overlay.querySelector('[data-admin-password]');
      input.type = this.adminAccess.passwordVisible ? 'text' : 'password';
      event.currentTarget.textContent = this.adminAccess.passwordVisible ? 'Ocultar' : 'Mostrar';
    });
    overlay.querySelector('[data-action="cancel-admin-access"]').addEventListener('click', () => this.closeAdminAccessModal());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.closeAdminAccessModal();
    });
    const onEscape = (event) => {
      if (event.key === 'Escape') {
        window.removeEventListener('keydown', onEscape);
        this.closeAdminAccessModal();
      }
    };
    window.addEventListener('keydown', onEscape, { once: true });
    return overlay;
  }

  buildSeedsSection() {
    return this.buildStoreSection();
  }

  buildStoreSection() {
    if (this.loading) {
      return createElement('div', { class: 'garden-loading panel' }, [
        createElement('h2', {}, 'Carregando loja...'),
        createElement('p', {}, 'Buscando os produtos comerciais do Grow a Garden 2.')
      ]);
    }

    if (this.error) {
      return createElement('div', { class: 'garden-error panel' }, [
        createElement('h2', {}, 'Erro ao carregar loja'),
        createElement('p', {}, this.error)
      ]);
    }

    const visibleProducts = this.getVisibleStoreProducts();
    const categorySections = this.getStoreCategories()
      .map((category) => {
        const products = visibleProducts.filter((product) => product.category === category.key);
        return products.length > 0 ? this.buildStoreCategorySection(category, products) : null;
      })
      .filter(Boolean);

    return createElement('div', { class: 'garden-storefront' }, [
      this.hasActiveStoreFilters() ? this.buildStoreControls() : null,
      categorySections.length > 0
        ? createElement('div', { class: 'store-sections' }, categorySections)
        : this.buildEmptyState('Nenhum produto encontrado', 'Ajuste a busca ou o filtro de categoria.')
    ]);
  }

  buildInformativeSeedsSection() {
    const grid = createElement('div', { class: 'seed-grid' });
    if (this.seeds.length === 0) {
      grid.append(this.buildEmptyState('Nenhuma semente carregada', 'A base real nao retornou registros para exibir.'));
    } else {
      this.getRows(this.seeds).forEach((row) => {
        grid.append(createElement('div', { class: 'seed-row' }, row.map((seed) => createElement('article', { class: 'seed-card' }, [
          this.buildSeedImage(seed),
          createElement('div', { class: 'seed-card-body' }, [
            createElement('strong', {}, seed.name),
            createElement('div', { class: 'seed-card-meta' }, [
              createElement('span', { class: 'seed-meta' }, seed.rarity || 'Raridade em revisao'),
              createElement('span', { class: 'seed-meta' }, seed.obtainMethod || 'Metodo em revisao')
            ]),
            createElement('p', {}, `Preco no jogo: ${this.formatPrice(seed)}`)
          ])
        ]))));
      });
    }
    return createElement('div', {}, [
      createElement('div', { class: 'catalog-heading panel' }, [
        createElement('span', { class: 'garden-kicker' }, 'Informacoes do jogo'),
        createElement('h2', {}, 'Catalogo informativo de seeds'),
        createElement('p', {}, 'Consulte raridade, preco em Sheckles, disponibilidade e status comercial sem confundir valores do jogo com reais.')
      ]),
      grid
    ]);
  }

  getStoreCategories() {
    return [
      { key: 'seeds', title: 'SEEDS (GROW A GARDEN 2)', icon: '🌱' },
      { key: 'pets', title: 'PETS (GROW A GARDEN 2)', icon: '🔥' },
      { key: 'gears', title: 'GEARS (GROW A GARDEN 2)', icon: '🛠' },
      { key: 'packages', title: 'PACOTES (GROW A GARDEN 2)', icon: '📦', subtitle: 'Promoção limitada' }
    ];
  }

  hasActiveStoreFilters() {
    return this.storeSearch.trim()
      || this.storeCategoryFilter !== 'all'
      || this.storeStockFilter !== 'all'
      || this.storeSort !== 'featured';
  }

  buildStoreControls() {
    const visibleCount = this.getVisibleStoreProducts().length;
    const controls = createElement('div', { class: 'store-controls' }, [
      createElement('div', { class: 'store-toolbar-top' }, [
        createElement('div', {}, [
          createElement('span', { class: 'garden-kicker' }, 'Marketplace gamer'),
          createElement('h2', {}, 'Loja Grow a Garden 2'),
          createElement('p', {}, `${visibleCount} produto${visibleCount === 1 ? '' : 's'} encontrado${visibleCount === 1 ? '' : 's'}.`)
        ]),
        createElement('input', {
          type: 'search',
          class: 'store-search',
          placeholder: 'Buscar produto',
          value: this.storeSearch,
          'aria-label': 'Buscar produto'
        })
      ]),
      createElement('div', { class: 'store-toolbar-controls' }, [
        createElement('div', { class: 'store-filter-tabs' }, [
          ...[
            ['all', 'Todos'],
            ['seeds', 'Seeds'],
            ['pets', 'Pets'],
            ['gears', 'Gears'],
            ['packages', 'Pacotes']
          ].map(([value, label]) => createElement('button', {
            type: 'button',
            class: `tab-button ${this.storeCategoryFilter === value ? 'active' : ''}`,
            'data-category': value
          }, label))
        ]),
        createElement('div', { class: 'store-filter-tabs compact' }, [
          ...[
            ['all', 'Todos'],
            ['available', 'Disponiveis'],
            ['deals', 'Promocoes'],
            ['out_of_stock', 'Esgotados']
          ].map(([value, label]) => createElement('button', {
            type: 'button',
            class: `tab-button ${this.storeStockFilter === value ? 'active' : ''}`,
            'data-stock-filter': value
          }, label))
        ]),
        createElement('label', { class: 'store-sort-control' }, [
          createElement('span', {}, 'Ordenar'),
          createElement('select', { 'aria-label': 'Ordenar produtos' }, [
            ...[
              ['featured', 'Destaques'],
              ['price_asc', 'Menor preco'],
              ['price_desc', 'Maior preco'],
              ['discount_desc', 'Maior desconto'],
              ['name_asc', 'Nome']
            ].map(([value, label]) => createElement('option', { value, selected: this.storeSort === value ? 'selected' : null }, label))
          ])
        ])
      ])
    ]);

    controls.querySelector('.store-search').addEventListener('input', (event) => {
      this.storeSearch = event.target.value;
      this.selectedSeedSlug = null;
      this.checkoutStateBySeed.clear();
      this.render();
    });
    controls.querySelectorAll('[data-category]').forEach((button) => {
      button.addEventListener('click', () => {
        this.storeCategoryFilter = button.getAttribute('data-category');
        this.selectedSeedSlug = null;
        this.checkoutStateBySeed.clear();
        this.render();
      });
    });
    controls.querySelectorAll('[data-stock-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        this.storeStockFilter = button.getAttribute('data-stock-filter');
        this.selectedSeedSlug = null;
        this.checkoutStateBySeed.clear();
        this.render();
      });
    });
    controls.querySelector('select').addEventListener('change', (event) => {
      this.storeSort = event.target.value;
      this.selectedSeedSlug = null;
      this.checkoutStateBySeed.clear();
      this.render();
    });
    return controls;
  }

  getVisibleStoreProducts() {
    const search = this.storeSearch.trim().toLowerCase();
    const products = this.storeProducts.filter((product) => {
      if (String(product.stockStatus || '').toLowerCase() === 'hidden') return false;
      if (this.storeCategoryFilter !== 'all' && product.category !== this.storeCategoryFilter) return false;
      if (this.storeStockFilter === 'available' && this.isSoldOut(product)) return false;
      if (['sold_out', 'out_of_stock'].includes(this.storeStockFilter) && !this.isSoldOut(product)) return false;
      if (this.storeStockFilter === 'deals' && !Number.isInteger(product.discountPercent)) return false;
      if (!search) return true;
      return product.name.toLowerCase().includes(search) || product.slug.includes(search);
    });
    return [...products].sort((a, b) => {
      if (this.storeSort === 'price_asc') return (a.salePriceInCents || 0) - (b.salePriceInCents || 0);
      if (this.storeSort === 'price_desc') return (b.salePriceInCents || 0) - (a.salePriceInCents || 0);
      if (this.storeSort === 'discount_desc') return (b.discountPercent || 0) - (a.discountPercent || 0);
      if (this.storeSort === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });
  }

  buildStoreCategorySection(category, products) {
    const grid = createElement('div', { class: 'seed-grid store-product-grid' });
    this.getRows(products).forEach((row) => grid.append(this.buildSeedRow(row)));
    return createElement('section', { class: 'store-category-section', 'data-store-category': category.key }, [
      createElement('div', { class: 'store-category-heading' }, [
        createElement('h2', {}, [
          createElement('span', { class: 'store-category-icon', 'aria-hidden': 'true' }, category.icon),
          createElement('span', {}, category.title)
        ]),
        category.subtitle ? createElement('span', {}, category.subtitle) : null
      ]),
      grid
    ]);
  }

  getSeedRows() {
    return this.getRows(this.storeProducts);
  }

  getRows(items) {
    const columns = window.matchMedia?.('(max-width: 640px)').matches
      ? 1
      : window.matchMedia?.('(max-width: 980px)').matches
        ? 2
        : window.matchMedia?.('(max-width: 1240px)').matches
          ? 3
          : 4;
    const rows = [];
    for (let index = 0; index < items.length; index += columns) {
      rows.push(items.slice(index, index + columns));
    }
    return rows;
  }

  buildSeedRow(rowSeeds) {
    const selectedInRow = rowSeeds.find((seed) => seed.slug === this.selectedSeedSlug);
    const row = createElement('div', { class: 'seed-row' }, [
      ...rowSeeds.map((seed) => this.buildSeedCard(seed)),
      selectedInRow ? this.buildSeedDetails(selectedInRow) : null
    ]);
    return row;
  }

  buildSeedCard(seed) {
    const isSelected = this.selectedSeedSlug === seed.slug;
    const soldOut = this.isSoldOut(seed);
    const card = createElement('article', {
      class: `seed-card store-product-card ${isSelected ? 'active' : ''} ${soldOut ? 'sold-out' : ''}`,
      'data-seed-slug': seed.slug
    }, [
      this.buildSeedImage(seed),
      createElement('div', { class: 'seed-card-body' }, [
        createElement('strong', {}, `${seed.name}${seed.badge ? ` (${seed.badge})` : ''}`),
        createElement('div', { class: 'store-price-row' }, [
          Number.isInteger(seed.originalPriceInCents)
            ? createElement('span', { class: 'old-price' }, formatMoney(seed.originalPriceInCents, seed.currency || 'BRL'))
            : null,
          Number.isInteger(seed.discountPercent)
            ? createElement('span', { class: 'discount-badge' }, `${seed.discountPercent}% OFF`)
            : null
        ]),
        createElement('span', { class: 'store-sale-price' }, formatMoney(seed.salePriceInCents, seed.currency || 'BRL')),
        createElement('span', { class: 'store-pix-label' }, 'À vista no Pix'),
        createElement('button', {
          type: 'button',
          class: 'button-primary store-buy-button',
          disabled: soldOut ? 'disabled' : null
        }, [
          createElement('span', { class: 'buy-button-icon', 'aria-hidden': 'true' }, ''),
          createElement('span', {}, soldOut ? 'Esgotado' : 'Comprar agora')
        ]),
        createElement('button', {
          type: 'button',
          class: 'button-secondary store-cart-button',
          disabled: soldOut ? 'disabled' : null,
          'aria-label': soldOut ? 'Produto esgotado' : 'Adicionar ao carrinho',
          title: soldOut ? 'Esgotado' : 'Adicionar ao carrinho'
        }, [
          createElement('span', { class: 'store-cart-icon', 'aria-hidden': 'true' }, ''),
          createElement('span', { class: 'visually-hidden' }, soldOut ? 'Esgotado' : 'Adicionar ao carrinho')
        ])
      ])
    ]);

    card.querySelector('.store-buy-button').addEventListener('click', (event) => {
      event.stopPropagation();
      this.handleBuyNow(seed.slug);
    });
    card.querySelector('.store-cart-button').addEventListener('click', (event) => {
      event.stopPropagation();
      this.addProductToCart(seed.slug);
    });

    card.addEventListener('click', () => {
      if (this.selectedSeedSlug === seed.slug) {
        this.selectedSeedSlug = null;
        this.clearCheckoutState(seed.slug);
      } else {
        this.selectedSeedSlug = seed.slug;
      }
      this.render();
    });
    return card;
  }

  buildSeedImage(seed) {
    const container = createElement('div', { class: 'seed-image-container' });
    if (this.isSoldOut(seed)) {
      container.append(createElement('span', { class: 'sold-out-ribbon' }, 'ESTOQUE ESGOTADO'));
    }
    if (seed.image) {
      const image = createElement('img', {
        src: seed.image,
        alt: seed.name,
        class: 'seed-image',
        loading: 'lazy',
        decoding: 'async'
      });
      image.addEventListener('error', () => {
        if (this.shouldLogStoreImageFallback()) {
          console.warn('Produto sem imagem:', {
            slug: seed.slug,
            image: seed.image
          });
        }
        if (image.parentNode) {
          image.parentNode.replaceChild(this.buildImageFallback(seed), image);
        }
      });
      container.append(image);
      if (!seed.category && !this.isSeedImageConfirmed(seed)) {
        container.append(createElement('span', { class: 'seed-image-status' }, 'Imagem em revisao'));
      }
    } else {
      container.append(this.buildImageFallback(seed));
    }
    return container;
  }

  shouldLogStoreImageFallback() {
    if (typeof window === 'undefined') return false;
    return ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  }

  buildImageFallback(seed) {
    return createElement('div', { class: 'seed-image-fallback' }, [
      createElement('strong', {}, 'Imagem em revisao'),
      createElement('span', {}, seed.name)
    ]);
  }

  buildSeedDetails(seed) {
    const soldOut = this.isSoldOut(seed);
    const details = createElement('div', {
      class: 'seed-details product-detail-layout',
      'data-checkout-for': seed.slug
    }, [
      createElement('section', { class: 'product-main-panel panel' }, [
        createElement('div', { class: 'product-media-stage' }, [
          this.buildSeedImage(seed)
        ]),
        createElement('div', { class: 'product-buy-column' }, [
          createElement('div', { class: 'product-title-block' }, [
            createElement('span', { class: 'garden-kicker' }, this.formatCategory(seed.category)),
            createElement('h3', {}, `${seed.name}${seed.badge ? ` (${seed.badge})` : ''}`),
            createElement('span', { class: `stock-pill ${soldOut ? 'sold' : 'available'}` }, soldOut ? 'Esgotado' : `${Number.isInteger(seed.availableStock) ? seed.availableStock : 62} em estoque`)
          ]),
          createElement('div', { class: 'product-price-stack' }, [
            Number.isInteger(seed.originalPriceInCents) ? createElement('span', { class: 'old-price' }, formatMoney(seed.originalPriceInCents, seed.currency || 'BRL')) : null,
            Number.isInteger(seed.discountPercent) ? createElement('span', { class: 'discount-badge' }, `${seed.discountPercent}% OFF`) : null,
            createElement('strong', { class: 'product-price' }, formatMoney(seed.salePriceInCents, seed.currency || 'BRL')),
            createElement('small', {}, 'A vista no Pix')
          ]),
          this.buildPurchasePanel(seed),
          soldOut ? createElement('p', { class: 'checkout-message error' }, 'Produto temporariamente esgotado.') : null
        ])
      ]),
      createElement('section', { class: 'product-description panel' }, [
        createElement('h3', {}, 'Descricao'),
        createElement('p', {}, `Nessa compra de Grow a Garden 2 voce ira receber: ${seed.name}.`),
        createElement('p', {}, seed.description || 'Uma otima semente no jogo. Confira o produto, quantidade e nick do Roblox antes de finalizar.'),
        createElement('p', {}, 'Perguntas frequentes:'),
        createElement('p', {}, 'Como sera feita a entrega? Um entregador da loja ira entregar o item por troca ou mail box do proprio jogo.'),
        createElement('p', {}, 'Como converso com o entregador? Apos criar o pedido, acompanhe o status e aguarde o contato combinado.'),
        createElement('p', { class: 'checkout-message error' }, 'Atencao: nao fazemos reembolso por simples arrependimento.')
      ]),
      this.buildProductSidePanel(seed),
      createElement('button', { type: 'button', class: 'button-secondary product-close', 'data-action': 'close-seed' }, 'Fechar detalhes')
    ]);
    details.querySelector('[data-action="close-seed"]').addEventListener('click', () => {
      this.selectedSeedSlug = null;
      this.clearCheckoutState(seed.slug);
      this.render();
    });
    return details;
  }

  buildProductSidePanel(seed) {
    return createElement('aside', { class: 'product-side-panel' }, [
      this.buildTrustCard('Entrega imediata', 'Receba seu pacote apos o pagamento ser conferido pela loja.'),
      this.buildTrustCard('Seguranca total', 'Dados usados apenas para organizar o pedido e a entrega manual.'),
      this.buildTrustCard('Formas de pagamento', `Pix manual para pedidos de ${formatMoney(seed.salePriceInCents, seed.currency || 'BRL')}.`),
      createElement('article', { class: 'trust-card reviews-card' }, [
        createElement('h3', {}, 'Avaliacoes'),
        createElement('div', { class: 'rating-line' }, [
          createElement('strong', {}, '5.00'),
          createElement('span', {}, '★★★★★')
        ]),
        createElement('small', {}, '28 avaliacoes'),
        createElement('p', {}, 'Muito bom. Confiavel. Entrega rapida.')
      ])
    ]);
  }

  buildTrustCard(title, text) {
    return createElement('article', { class: 'trust-card' }, [
      createElement('h3', {}, title),
      createElement('p', {}, text)
    ]);
  }

  buildPurchasePanel(seed) {
    const canOpenCheckout = this.canOpenCheckout(seed);
    const soldOut = this.isSoldOut(seed);
    const panel = createElement('div', { class: 'seed-purchase-panel' }, [
      createElement('p', { class: 'commerce-warning' }, STORE_COMMERCE_CONFIG.commerceEnabled
        ? 'O Pix sera gerado pelo servidor apos validar preco, estoque e cupom.'
        : 'Checkout temporariamente indisponivel.'),
      createElement('p', {}, soldOut ? 'Produto temporariamente esgotado.' : (canOpenCheckout.ok ? 'Pedido Pix manual disponivel.' : canOpenCheckout.reason)),
      createElement('button', {
        type: 'button',
        class: 'button-primary',
        'data-action': 'open-checkout',
        disabled: canOpenCheckout.ok && !soldOut ? null : 'disabled'
      }, soldOut ? 'Sem estoque' : 'Comprar agora'),
      createElement('button', {
        type: 'button',
        class: 'button-secondary',
        'data-action': 'open-checkout-secondary',
        disabled: canOpenCheckout.ok && !soldOut ? null : 'disabled'
      }, soldOut ? 'Sem estoque' : 'Adicionar ao carrinho')
    ]);

    panel.querySelector('[data-action="open-checkout"]').addEventListener('click', () => {
      this.handleBuyNow(seed.slug);
    });
    panel.querySelector('[data-action="open-checkout-secondary"]').addEventListener('click', () => {
      this.addProductToCart(seed.slug);
    });

    return panel;
  }

  handleBuyNow(productSlug) {
    const product = this.storeProducts.find((item) => item.slug === productSlug);
    if (!product || this.isSoldOut(product)) return;
    this.selectedSeedSlug = product.slug;
    this.resetCheckoutState(product);
    this.activeTab = 'checkout';
    this.render();
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  getCartCount() {
    return this.cartService.count(this.cartItems);
  }

  getCartProduct(productSlug) {
    return this.storeProducts.find((product) => product.slug === productSlug) || null;
  }

  getCartQuantityLimit(product) {
    const limits = [product?.maxPerOrder, product?.commerce?.maxPerOrder, product?.availableStock, product?.commerce?.availableStock]
      .filter((value) => Number.isInteger(value) && value > 0);
    return limits.length > 0 ? Math.min(...limits) : 99;
  }

  clampCartQuantity(product, quantity) {
    const parsed = Number.parseInt(quantity, 10);
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    return Math.min(safe, this.getCartQuantityLimit(product));
  }

  addProductToCart(productSlug) {
    const product = this.getCartProduct(productSlug);
    if (!product || this.isSoldOut(product)) {
      this.cartState.message = 'Produto esgotado ou indisponivel.';
      this.cartState.messageStatus = 'error';
      this.activeTab = 'carrinho';
      this.render();
      return;
    }
    const existing = this.cartItems.find((item) => item.productSlug === productSlug);
    const nextQuantity = this.clampCartQuantity(product, (existing?.quantity || 0) + 1);
    this.cartItems = existing
      ? this.cartService.updateQuantity(this.cartItems, productSlug, nextQuantity)
      : this.cartService.addItem(product, 1);
    this.cartState.message = 'Produto adicionado ao carrinho';
    this.cartState.messageStatus = 'success';
    this.cartState.order = null;
    this.recalculateCartCoupon();
    this.render();
  }

  updateCartItemQuantity(productSlug, step) {
    const product = this.getCartProduct(productSlug);
    const item = this.cartItems.find((entry) => entry.productSlug === productSlug);
    if (!product || !item) return;
    const requested = item.quantity + step;
    if (requested < 1) {
      if (window.confirm('Deseja remover este produto do carrinho?')) {
        this.removeCartItem(productSlug);
      }
      return;
    }
    const nextQuantity = this.clampCartQuantity(product, requested);
    this.cartItems = this.cartService.updateQuantity(this.cartItems, productSlug, nextQuantity);
    this.cartState.message = requested > nextQuantity ? 'Quantidade ajustada ao limite de estoque deste produto.' : '';
    this.cartState.messageStatus = requested > nextQuantity ? 'error' : '';
    this.recalculateCartCoupon();
    this.render();
  }

  removeCartItem(productSlug) {
    this.cartItems = this.cartService.remove(this.cartItems, productSlug);
    this.cartState.message = this.cartItems.length > 0 ? 'Produto removido do carrinho.' : '';
    this.cartState.messageStatus = 'success';
    this.recalculateCartCoupon();
    this.render();
  }

  clearCart({ ask = true } = {}) {
    if (ask && !window.confirm('Deseja remover todos os produtos do carrinho?')) return;
    this.cartItems = [];
    this.cartService.clear();
    this.cartState.appliedCouponCode = '';
    this.cartState.discountInCents = 0;
    this.cartState.couponMessage = '';
    this.cartState.couponStatus = '';
    this.cartState.message = '';
    this.cartState.order = null;
    this.render();
  }

  removeUnavailableCartItems() {
    const unavailable = new Set(this.getCartLines()
      .filter((line) => !line.stockOk)
      .map((line) => line.product.slug));
    if (unavailable.size === 0) return;
    this.cartItems = this.cartItems.filter((item) => !unavailable.has(item.productSlug));
    this.cartItems = this.cartService.save(this.cartItems);
    this.cartState.message = 'Itens indisponiveis removidos do carrinho.';
    this.cartState.messageStatus = 'success';
    this.recalculateCartCoupon();
    this.render();
  }

  getCartLines() {
    return this.cartItems.map((item) => {
      const product = this.getCartProduct(item.productSlug);
      if (!product) return null;
      const quantity = this.clampCartQuantity(product, item.quantity);
      return {
        product,
        quantity,
        subtotalInCents: (product.priceInCents || product.salePriceInCents || 0) * quantity,
        stockOk: !this.isSoldOut(product) && quantity <= this.getCartQuantityLimit(product)
      };
    }).filter(Boolean);
  }

  calculateCartTotals() {
    const lines = this.getCartLines();
    const subtotalInCents = lines.reduce((total, line) => total + line.subtotalInCents, 0);
    const discountInCents = Math.min(this.cartState.discountInCents || 0, subtotalInCents);
    return {
      lines,
      subtotalInCents,
      discountInCents,
      totalInCents: Math.max(0, subtotalInCents - discountInCents),
      totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
      stockOk: lines.every((line) => line.stockOk)
    };
  }

  recalculateCartCoupon() {
    if (!this.cartState.appliedCouponCode) return;
    const totals = this.calculateCartTotals();
    const coupon = this.coupons.find((item) => normalizeCouponCode(item.code) === normalizeCouponCode(this.cartState.appliedCouponCode));
    const result = calculateCouponDiscountInCents({
      coupon,
      subtotalInCents: totals.subtotalInCents,
      productSlugs: totals.lines.map((line) => line.product.slug),
      productCategories: totals.lines.map((line) => line.product.category),
      productLines: totals.lines.map((line) => ({
        productSlug: line.product.slug,
        productCategory: line.product.category,
        subtotalInCents: line.subtotalInCents
      }))
    });
    console.info('CHECKOUT_COUPON_VALIDATE', {
      code,
      coupon,
      cartItems: totals.lines.map((line) => ({
        productSlug: line.product.slug,
        productName: line.product.name,
        category: line.product.category,
        subtotalInCents: line.subtotalInCents
      })),
      result
    });
    if (result.ok) {
      this.cartState.discountInCents = result.discountInCents;
      return;
    }
    this.cartState.appliedCouponCode = '';
    this.cartState.discountInCents = 0;
    this.cartState.couponMessage = result.reason;
    this.cartState.couponStatus = 'error';
  }

  applyCartCoupon() {
    const code = normalizeCouponCode(this.cartState.couponCode);
    const totals = this.calculateCartTotals();
    const coupon = this.coupons.find((item) => normalizeCouponCode(item.code) === code);
    const result = calculateCouponDiscountInCents({
      coupon,
      subtotalInCents: totals.subtotalInCents,
      productSlugs: totals.lines.map((line) => line.product.slug),
      productCategories: totals.lines.map((line) => line.product.category),
      productLines: totals.lines.map((line) => ({
        productSlug: line.product.slug,
        productCategory: line.product.category,
        subtotalInCents: line.subtotalInCents
      }))
    });
    if (!result.ok) {
      this.cartState.appliedCouponCode = '';
      this.cartState.discountInCents = 0;
      this.cartState.couponMessage = result.reason || 'Cupom invalido ou expirado.';
      this.cartState.couponStatus = 'error';
      this.render();
      return;
    }
    this.cartState.appliedCouponCode = code;
    this.cartState.discountInCents = result.discountInCents;
    this.cartState.couponMessage = `Cupom ${code} aplicado.`;
    this.cartState.couponStatus = 'success';
    this.render();
  }

  removeCartCoupon() {
    this.cartState.appliedCouponCode = '';
    this.cartState.discountInCents = 0;
    this.cartState.couponCode = '';
    this.cartState.couponMessage = 'Cupom removido.';
    this.cartState.couponStatus = 'success';
    this.render();
  }

  captureCartForm(formElement) {
    const form = new FormData(formElement);
    this.cartState.customerName = String(form.get('customerName') || '');
    this.cartState.robloxUsername = String(form.get('robloxUsername') || '');
    this.cartState.robloxDisplayName = String(form.get('robloxDisplayName') || '');
    this.cartState.email = String(form.get('email') || '');
    this.cartState.couponCode = String(form.get('couponCode') || '');
    this.cartState.termsAccepted = form.get('termsAccepted') === 'on';
  }

  buildCartView() {
    const totals = this.calculateCartTotals();
    if (totals.lines.length === 0 && this.cartItems.length > 0) {
      this.cartItems = [];
      this.cartService.clear();
    }
    if (totals.lines.length === 0 && !this.cartState.order) {
      const empty = createElement('section', { class: 'cart-screen garden-empty panel' }, [
        createElement('h2', {}, 'Seu carrinho'),
        createElement('p', {}, 'Seu carrinho esta vazio.'),
        createElement('div', { class: 'cart-panel-actions' }, [
          createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'explore-products' }, 'Explorar produtos'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'back-store' }, 'Voltar a loja')
        ])
      ]);
      empty.querySelector('[data-action="explore-products"]').addEventListener('click', () => {
        this.activeTab = 'sementes';
        this.render();
      });
      empty.querySelector('[data-action="back-store"]').addEventListener('click', () => {
        this.activeTab = 'sementes';
        this.render();
      });
      return empty;
    }
    if (this.cartItems.length === 0 && this.cartState.order) {
      const created = createElement('section', { class: 'cart-created-order panel' }, [
        createElement('div', { class: 'checkout-summary-heading' }, [
          createElement('h2', {}, 'Pedido criado'),
          createElement('span', { class: 'status-pill' }, 'Aguardando pagamento')
        ]),
        this.cartState.message ? createElement('p', { class: `checkout-message ${this.cartState.messageStatus || ''}` }, this.cartState.message) : null,
        this.buildPixPaymentPanel(this.storeProducts[0], this.cartState.order, this.cartState),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'explore-products' }, 'Explorar produtos')
      ]);
      created.querySelector('[data-action="explore-products"]').addEventListener('click', () => {
        this.activeTab = 'sementes';
        this.render();
      });
      return created;
    }

    const form = createElement('form', { class: 'cart-screen checkout-payment-view' }, [
      createElement('section', { class: 'cart-items-panel panel' }, [
        createElement('div', { class: 'checkout-summary-heading' }, [
          createElement('h2', {}, 'Carrinho'),
          createElement('span', { class: 'status-pill' }, `${totals.totalQuantity} item(ns)`)
        ]),
        this.cartState.message ? createElement('p', { class: `checkout-message ${this.cartState.messageStatus || ''}` }, this.cartState.message) : null,
        ...totals.lines.map((line) => this.buildCartItemLine(line)),
        createElement('div', { class: 'cart-panel-actions' }, [
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'continue-shopping' }, 'Explorar produtos'),
          totals.stockOk ? null : createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'remove-unavailable' }, 'Remover itens indisponiveis'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'clear-cart' }, 'Limpar carrinho')
        ]),
        this.cartState.order ? this.buildPixPaymentPanel(totals.lines[0]?.product || this.storeProducts[0], this.cartState.order, this.cartState) : null
      ]),
      createElement('aside', { class: 'checkout-summary checkout-summary-card cart-checkout-panel' }, [
        createElement('div', { class: 'checkout-summary-heading' }, [
          createElement('h3', {}, 'Resumo do carrinho'),
          createElement('span', { class: 'status-pill' }, totals.stockOk ? 'Estoque ok' : 'Ajuste o estoque')
        ]),
        createElement('section', { class: 'checkout-card checkout-contact-card' }, [
          createElement('h3', {}, 'Dados do cliente'),
          createElement('div', { class: 'checkout-contact-grid' }, [
            this.buildField('customerName', 'Nome do cliente', 'text', this.cartState.customerName, { required: 'required' }),
            this.buildField('email', 'E-mail', 'email', this.cartState.email),
            this.buildField('robloxUsername', 'Nick do Roblox', 'text', this.cartState.robloxUsername, { required: 'required', autocomplete: 'username' }),
            this.buildField('robloxDisplayName', 'Nome de exibicao do Roblox (opcional)', 'text', this.cartState.robloxDisplayName)
          ]),
          createElement('p', { class: 'checkout-security-note' }, 'Nunca informe sua senha, cookie ou codigo de autenticacao do Roblox.')
        ]),
        createElement('div', { class: 'coupon-row checkout-coupon-row' }, [
          createElement('input', { name: 'couponCode', type: 'text', placeholder: 'Digite seu cupom de desconto', value: this.cartState.couponCode }),
          createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'apply-cart-coupon' }, 'Aplicar'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'remove-cart-coupon' }, 'Remover')
        ]),
        this.cartState.couponMessage ? createElement('p', { class: `checkout-message ${this.cartState.couponStatus || ''}` }, this.cartState.couponMessage) : null,
        createElement('div', { class: 'checkout-total-box' }, [
          createElement('span', {}, ['Quantidade total', createElement('strong', {}, String(totals.totalQuantity))]),
          createElement('span', {}, ['Subtotal', createElement('strong', {}, formatMoney(totals.subtotalInCents, 'BRL'))]),
          createElement('span', {}, ['Desconto', createElement('strong', {}, `-${formatMoney(totals.discountInCents, 'BRL')}`)]),
          createElement('span', { class: 'checkout-total-line' }, ['Total', createElement('strong', {}, formatMoney(totals.totalInCents, 'BRL'))]),
          createElement('span', {}, ['Pagamento', createElement('strong', {}, 'Pix')])
        ]),
        createElement('label', { class: 'terms-check checkout-terms' }, [
          createElement('input', { type: 'checkbox', name: 'termsAccepted', checked: this.cartState.termsAccepted ? 'checked' : null }),
          createElement('span', {}, 'Eu aceito os termos e condicoes desta compra.')
        ]),
        createElement('button', { type: 'submit', class: 'button-primary checkout-pay-button', disabled: totals.stockOk ? null : 'disabled' }, `Finalizar compra - ${formatMoney(totals.totalInCents, 'BRL')}`)
      ])
    ]);

    form.addEventListener('input', () => this.captureCartForm(form));
    form.addEventListener('change', () => this.captureCartForm(form));
    form.querySelector('[data-action="continue-shopping"]').addEventListener('click', () => {
      this.activeTab = 'sementes';
      this.render();
    });
    form.querySelector('[data-action="clear-cart"]').addEventListener('click', () => this.clearCart());
    form.querySelector('[data-action="remove-unavailable"]')?.addEventListener('click', () => this.removeUnavailableCartItems());
    form.querySelector('[data-action="apply-cart-coupon"]').addEventListener('click', () => {
      this.captureCartForm(form);
      this.applyCartCoupon();
    });
    form.querySelector('[data-action="remove-cart-coupon"]').addEventListener('click', () => {
      this.captureCartForm(form);
      this.removeCartCoupon();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      this.captureCartForm(form);
      await this.submitCartOrder();
    });
    form.querySelector('[data-action="explore-products"]')?.addEventListener('click', () => {
      this.activeTab = 'sementes';
      this.render();
    });
    return form;
  }

  buildCartItemLine(line) {
    const { product, quantity, subtotalInCents, stockOk } = line;
    const item = createElement('article', { class: `cart-item-line ${stockOk ? '' : 'stock-error'}` }, [
      createElement('img', { src: product.image, alt: product.name, loading: 'lazy' }),
      createElement('div', { class: 'cart-item-copy' }, [
        createElement('strong', {}, product.name),
        createElement('span', {}, `${this.formatCategory(product.category)} · pacote com ${product.packageQuantity || 1}`),
        createElement('small', {}, stockOk ? 'Estoque disponivel' : 'Este produto esta sem estoque e precisa ser removido do carrinho.')
      ]),
      createElement('span', {}, formatMoney(product.priceInCents || product.salePriceInCents, product.currency || 'BRL')),
      createElement('div', { class: 'quantity-stepper cart-quantity-stepper' }, [
        createElement('button', { type: 'button', class: 'quantity-button', 'data-cart-decrease': product.slug, 'aria-label': 'Diminuir quantidade' }, '-'),
        createElement('input', { type: 'number', readonly: true, min: '1', value: String(quantity), 'aria-label': 'Quantidade escolhida' }),
        createElement('button', { type: 'button', class: 'quantity-button', 'data-cart-increase': product.slug, 'aria-label': 'Aumentar quantidade' }, '+')
      ]),
      createElement('strong', {}, formatMoney(subtotalInCents, product.currency || 'BRL')),
      createElement('button', { type: 'button', class: 'remove-item-button', 'data-cart-remove': product.slug, 'aria-label': 'Remover item' }, 'x')
    ]);
    item.querySelector('[data-cart-decrease]').addEventListener('click', () => this.updateCartItemQuantity(product.slug, -1));
    item.querySelector('[data-cart-increase]').addEventListener('click', () => this.updateCartItemQuantity(product.slug, 1));
    item.querySelector('[data-cart-remove]').addEventListener('click', () => this.removeCartItem(product.slug));
    return item;
  }

  async submitCartOrder() {
    const totals = this.calculateCartTotals();
    if (totals.lines.length === 0) return;
    if (!totals.stockOk) {
      this.cartState.message = 'Este produto esta sem estoque e precisa ser removido do carrinho.';
      this.cartState.messageStatus = 'error';
      this.render();
      return;
    }
    try {
      const order = await this.createCheckoutOrder(totals.lines[0].product, {
        items: totals.lines.map((line) => ({ productSlug: line.product.slug, quantity: line.quantity })),
        customerName: this.cartState.customerName,
        customerUserId: this.currentUser?.id || this.authService.getCurrentUser()?.id || null,
        email: this.cartState.email,
        robloxUsername: this.cartState.robloxUsername,
        robloxDisplayName: this.cartState.robloxDisplayName,
        couponCode: this.cartState.appliedCouponCode || this.cartState.couponCode || null,
        termsAccepted: this.cartState.termsAccepted
      });
      this.cartState.order = order;
      this.cartState.message = 'Pedido Pix criado. O carrinho foi limpo apos a confirmacao do pedido.';
      this.cartState.messageStatus = 'success';
      this.cartItems = [];
      this.cartService.clear();
      this.upsertManualOrder(order);
      this.pendingPixScrollSlug = 'cart';
      this.render();
    } catch (error) {
      this.cartState.message = mapOrderError(error);
      this.cartState.messageStatus = 'error';
      this.render();
    }
  }

  buildCheckoutView() {
    const product = this.storeProducts.find((item) => item.slug === this.selectedSeedSlug);
    if (!product) {
      const empty = createElement('section', { class: 'checkout-screen garden-empty panel' }, [
        createElement('span', { class: 'garden-kicker' }, 'Checkout'),
        createElement('h2', {}, 'Produto nao encontrado'),
        createElement('p', {}, 'Volte para a loja e escolha um produto disponivel.'),
        createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'back-store' }, 'Voltar a loja')
      ]);
      empty.querySelector('[data-action="back-store"]').addEventListener('click', () => {
        this.activeTab = 'sementes';
        this.render();
      });
      return empty;
    }

    const screen = createElement('section', { class: 'checkout-screen' }, [
      createElement('div', { class: 'checkout-screen-top panel' }, [
        createElement('div', {}, [
          createElement('span', { class: 'garden-kicker' }, 'Checkout'),
          createElement('h2', {}, product.name),
          createElement('p', {}, 'Nunca informe sua senha, cookie ou codigo de autenticacao do Roblox.')
        ]),
        createElement('div', { class: 'checkout-screen-actions' }, [
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'back-product' }, 'Voltar ao produto'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'back-store' }, 'Voltar a loja')
        ])
      ]),
      this.buildCheckout(product)
    ]);

    screen.querySelector('[data-action="back-product"]').addEventListener('click', () => {
      this.clearCheckoutState(product.slug);
      this.selectedSeedSlug = product.slug;
      this.activeTab = 'sementes';
      this.render();
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    });
    screen.querySelector('[data-action="back-store"]').addEventListener('click', () => {
      this.clearCheckoutState(product.slug);
      this.selectedSeedSlug = null;
      this.activeTab = 'sementes';
      this.render();
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    });
    return screen;
  }

  buildCheckout(seed) {
    const state = this.getCheckoutState(seed);
    const totals = this.calculateCheckoutTotals(seed, state);
    const quantityLimit = seed.commerce?.maxPerOrder || seed.commerce?.availableStock || 1;
    const currency = seed.commerce?.currency || 'BRL';
    const checkout = createElement('form', { class: 'seed-checkout panel checkout-payment-view' }, [
      createElement('div', { class: 'checkout-left-column' }, [
        createElement('div', { class: 'checkout-breadcrumb' }, [
          createElement('strong', {}, 'Checkout'),
          createElement('span', {}, 'Inicio'),
          createElement('span', {}, '>'),
          createElement('span', {}, 'Checkout')
        ]),
        createElement('section', { class: 'checkout-card checkout-payment-methods' }, [
          createElement('h3', {}, 'Formas de pagamento'),
          createElement('div', { class: 'payment-method-card selected' }, [
            createElement('span', { class: 'pix-method-icon', 'aria-hidden': 'true' }, ''),
            createElement('span', { class: 'payment-method-copy' }, [
              createElement('strong', {}, 'Pix'),
              createElement('small', {}, 'Aprovacao imediata')
            ]),
            createElement('span', { class: 'fast-badge' }, 'Mais rapido')
          ])
        ]),
        createElement('section', { class: 'checkout-card checkout-contact-card' }, [
          createElement('h3', {}, 'Informacoes de contato'),
          createElement('div', { class: 'checkout-contact-grid' }, [
            this.buildField('customerName', 'Nome', 'text', state.customerName, {
              required: 'required',
              autocomplete: 'name',
              placeholder: 'Digite seu nome'
            }),
            this.buildField('email', 'E-mail', 'email', state.email, {
              required: 'required',
              autocomplete: 'email',
              placeholder: 'Digite seu e-mail'
            }),
            this.buildField('robloxUsername', 'Nick do Roblox', 'text', state.robloxUsername, {
              required: 'required',
              autocomplete: 'off',
              placeholder: 'Digite seu nick do Roblox',
              maxlength: '20',
              pattern: '[A-Za-z0-9_]{3,20}'
            }),
            this.buildField('robloxDisplayName', 'Nome de exibicao do Roblox opcional', 'text', state.robloxDisplayName, {
              autocomplete: 'off',
              placeholder: 'Opcional'
            })
          ])
        ]),
        createElement('label', { class: 'terms-check checkout-terms' }, [
          createElement('input', { type: 'checkbox', name: 'termsAccepted', checked: state.termsAccepted ? 'checked' : null }),
          createElement('span', {}, 'Eu aceito os termos e condicoes desta compra.')
        ]),
        state.message ? createElement('p', { class: `checkout-message ${state.messageStatus || ''}` }, state.message) : null
      ]),
      createElement('aside', { class: 'checkout-summary checkout-summary-card' }, [
        createElement('div', { class: 'checkout-summary-heading' }, [
          createElement('h3', {}, 'Resumo do pedido'),
          createElement('span', { class: 'secure-payment-badge' }, 'Pagamento seguro')
        ]),
        createElement('div', { class: 'checkout-product-line' }, [
          createElement('div', { class: 'checkout-product-thumb' }, [
            this.buildSeedImage(seed)
          ]),
          createElement('div', { class: 'checkout-product-copy' }, [
            createElement('strong', {}, seed.name),
            createElement('small', {}, formatMoney(seed.commerce?.priceInCents, currency)),
            createElement('small', {}, `Pacote: ${seed.packageQuantity || 1}`)
          ]),
          createElement('div', { class: 'quantity-stepper', 'aria-label': 'Quantidade do pedido' }, [
            createElement('button', { type: 'button', class: 'quantity-button', 'data-action': 'decrease-quantity', 'aria-label': 'Diminuir quantidade' }, '-'),
            createElement('input', {
              name: 'quantity',
              type: 'number',
              min: '1',
              max: String(quantityLimit),
              required: 'required',
              value: state.quantity,
              'aria-label': 'Quantidade'
            }),
            createElement('button', { type: 'button', class: 'quantity-button', 'data-action': 'increase-quantity', 'aria-label': 'Aumentar quantidade' }, '+')
          ]),
          createElement('button', { type: 'button', class: 'remove-item-button', 'data-action': 'remove-checkout-item', 'aria-label': 'Remover item' }, 'x'),
          createElement('strong', { class: 'checkout-line-price', 'data-summary': 'line-total' }, formatMoney(totals.subtotalInCents, currency))
        ]),
        createElement('div', { class: 'coupon-row checkout-coupon-row' }, [
          this.buildField('couponCode', 'Cupom', 'text', state.couponCode, {
            autocomplete: 'off',
            placeholder: 'Digite seu cupom de desconto'
          }),
          createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'apply-coupon' }, 'Aplicar'),
          state.appliedCouponCode ? createElement('button', {
            type: 'button',
            class: 'button-secondary',
            'data-action': 'remove-coupon'
          }, 'Remover') : null
        ]),
        state.couponMessage ? createElement('p', { class: `checkout-message ${state.couponStatus || ''}` }, state.couponMessage) : null,
        createElement('small', { class: 'checkout-coupon-state', 'data-summary': 'coupon-state' }, state.appliedCouponCode ? `Cupom ${state.appliedCouponCode} aplicado.` : 'Nenhum cupom aplicado.'),
        createElement('div', { class: 'checkout-total-box' }, [
          createElement('span', {}, [
            createElement('small', {}, 'Subtotal'),
            createElement('strong', { 'data-summary': 'subtotal' }, formatMoney(totals.subtotalInCents, currency))
          ]),
          createElement('span', {}, [
            createElement('small', {}, 'Descontos'),
            createElement('strong', { 'data-summary': 'discount' }, formatMoney(totals.discountInCents, currency))
          ]),
          createElement('span', { class: 'checkout-total-line' }, [
            createElement('small', {}, 'Total'),
            createElement('strong', { 'data-summary': 'total' }, formatMoney(totals.totalInCents, currency))
          ])
        ]),
        createElement('div', { class: 'checkout-actions checkout-pay-actions' }, [
          createElement('button', { type: 'submit', class: 'button-primary checkout-pay-button', 'data-pay-button': 'true' }, `Gerar pedido Pix - ${formatMoney(totals.totalInCents, currency)}`),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'cancel-checkout' }, 'Voltar a loja')
        ])
      ]),
      state.order ? this.buildPixPaymentPanel(seed, state.order, state) : null
    ]);

    checkout.addEventListener('input', () => {
      this.captureCheckoutState(seed.slug, checkout);
      this.updateCheckoutSummary(checkout, seed);
    });
    checkout.addEventListener('change', () => {
      this.captureCheckoutState(seed.slug, checkout);
      this.updateCheckoutSummary(checkout, seed);
    });
    checkout.querySelector('[data-action="apply-coupon"]').addEventListener('click', () => {
      this.captureCheckoutState(seed.slug, checkout);
      this.applyCoupon(seed);
      this.render();
    });
    checkout.querySelector('[data-action="remove-coupon"]')?.addEventListener('click', () => {
      this.captureCheckoutState(seed.slug, checkout);
      const currentState = this.getCheckoutState(seed);
      currentState.couponCode = '';
      currentState.appliedCouponCode = '';
      currentState.discountInCents = 0;
      currentState.couponMessage = 'Cupom removido.';
      currentState.couponStatus = 'success';
      currentState.order = null;
      this.render();
    });
    checkout.querySelector('[data-action="decrease-quantity"]').addEventListener('click', () => {
      this.changeCheckoutQuantity(seed, checkout, -1);
    });
    checkout.querySelector('[data-action="increase-quantity"]').addEventListener('click', () => {
      this.changeCheckoutQuantity(seed, checkout, 1);
    });
    checkout.querySelector('[data-action="remove-checkout-item"]').addEventListener('click', () => {
      this.clearCheckoutState(seed.slug);
      this.selectedSeedSlug = null;
      this.activeTab = 'sementes';
      this.render();
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    });
    checkout.addEventListener('submit', async (event) => {
      event.preventDefault();
      this.captureCheckoutState(seed.slug, checkout);
      const currentState = this.getCheckoutState(seed);
      const form = new FormData(checkout);
      const customerName = String(form.get('customerName') || '').trim();
      const email = String(form.get('email') || '').trim();
      if (!customerName) {
        currentState.message = 'Informe o nome do cliente.';
        currentState.messageStatus = 'error';
        currentState.order = null;
        this.render();
        return;
      }
      if (!email) {
        currentState.message = 'Informe o e-mail.';
        currentState.messageStatus = 'error';
        currentState.order = null;
        this.render();
        return;
      }
      const username = validateRobloxUsername(form.get('robloxUsername'));
      if (!username.ok) {
        currentState.message = username.reason;
        currentState.messageStatus = 'error';
        currentState.order = null;
        this.render();
        return;
      }
      const requestBody = {
        seedSlug: seed.slug,
        quantity: form.get('quantity'),
        customerName,
        customerUserId: this.currentUser?.id || this.authService.getCurrentUser()?.id || null,
        email,
        robloxUsername: form.get('robloxUsername'),
        robloxDisplayName: form.get('robloxDisplayName'),
        couponCode: String(form.get('couponCode') || '').trim() || null,
        termsAccepted: form.get('termsAccepted') === 'on'
      };
      try {
        const order = await this.createCheckoutOrder(seed, requestBody);
        currentState.message = 'Pedido Pix criado. Confirme que seu nick do Roblox esta correto antes de pagar.';
        currentState.messageStatus = 'success';
        currentState.order = order;
        this.upsertManualOrder(order);
        this.pendingPixScrollSlug = seed.slug;
        this.render();
      } catch (error) {
        console.error('ORDER_CREATE_ERROR', {
          url: error?.url || this.getOrderApiUrl(),
          method: 'POST',
          body: requestBody,
          message: error?.message,
          code: error?.code,
          status: error?.status,
          response: error?.response,
          responseText: String(error?.responseText || '').slice(0, 500),
          contentType: error?.contentType,
          details: error
        });
        currentState.message = mapOrderError(error);
        currentState.messageStatus = 'error';
        currentState.order = null;
        this.render();
        return;
      }
    });

    checkout.querySelector('[data-action="cancel-checkout"]').addEventListener('click', () => {
      this.clearCheckoutState(seed.slug);
      this.selectedSeedSlug = null;
      this.activeTab = 'sementes';
      this.render();
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    });

    return checkout;
  }

  isLocalOrderStorageMode() {
    return STORE_COMMERCE_CONFIG.orderStorageMode === 'local';
  }

  isCheckoutDebugEnabled() {
    const host = String(globalThis.location?.hostname || '');
    return ['localhost', '127.0.0.1', '::1'].includes(host);
  }

  getOrderApiUrl() {
    const baseUrl = String(STORE_COMMERCE_CONFIG.apiBaseUrl || '').replace(/\/$/, '');
    return baseUrl ? `${baseUrl}${ORDER_API_PATH}` : DEFAULT_ORDER_API_URL;
  }

  getPixApiUrl(orderCode) {
    const baseUrl = String(STORE_COMMERCE_CONFIG.apiBaseUrl || '').replace(/\/$/, '');
    const path = `/store/orders/${encodeURIComponent(orderCode)}/pix`;
    return baseUrl ? `${baseUrl}${path}` : `/api${path}`;
  }

  async createCheckoutOrder(seed, requestBody) {
    if (this.isLocalOrderStorageMode()) {
      return this.createLocalOrder(seed, requestBody);
    }
    return this.createApiOrder(requestBody);
  }

  async createPixCharge(order, state) {
    if (!order?.orderCode) return;
    if (state.pixChargeLoading) return;
    const url = this.getPixApiUrl(order.orderCode);
    state.pixChargeLoading = true;
    state.message = '';
    state.messageStatus = '';
    this.render();

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
    } catch (error) {
      state.pixChargeLoading = false;
      state.message = mapPixError({ code: 'PIX_GATEWAY_OFFLINE', message: error?.message });
      state.messageStatus = 'error';
      console.error('PIX_CHARGE_REQUEST_ERROR', {
        endpoint: url,
        method: 'POST',
        body: {},
        message: error?.message,
        code: 'PIX_GATEWAY_OFFLINE'
      });
      this.render();
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();
    let body = {};
    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        body = {};
      }
    }
    state.pixChargeLoading = false;
    if (!response.ok) {
      const error = new OrderServiceError(body.code || 'PIX_PAYLOAD_ERROR', body.error || 'PIX_PAYLOAD_ERROR', {
        status: response.status,
        response: body,
        responseText,
        contentType,
        url
      });
      console.error('PIX_CHARGE_ERROR', {
        endpoint: url,
        method: 'POST',
        body: {},
        status: error.status,
        response: error.response,
        responseText: error.responseText,
        message: error.message,
        code: error.code
      });
      state.message = mapPixError(error);
      state.messageStatus = 'error';
      this.render();
      return;
    }

    const updatedOrder = body.order || {};
    Object.assign(order, updatedOrder, {
      paymentId: body.paymentId || updatedOrder.paymentId || order.paymentId,
      paymentStatus: body.paymentStatus || updatedOrder.paymentStatus || order.paymentStatus,
      pixPayload: body.pixCopyPaste || updatedOrder.pixPayload || order.pixPayload,
      pixCopyPasteCode: body.pixCopyPaste || updatedOrder.pixCopyPasteCode || order.pixCopyPasteCode,
      pixQrCode: body.qrCode || updatedOrder.pixQrCode || order.pixQrCode,
      pixQrImageUrl: body.qrCodeImageUrl || updatedOrder.pixQrImageUrl || order.pixQrImageUrl,
      pixExpiresAt: body.expiresAt || updatedOrder.pixExpiresAt || order.pixExpiresAt,
      pixMode: body.mode || updatedOrder.pixMode || order.pixMode,
      pixChargeAmountInCents: body.amountInCents || updatedOrder.pixChargeAmountInCents || order.pixChargeAmountInCents
    });
    this.upsertManualOrder(order);
    state.message = 'Cobranca Pix gerada para este pedido.';
    state.messageStatus = 'success';
    this.render();
  }

  async createApiOrder(requestBody) {
    const url = this.getOrderApiUrl();
    if (!url) throw new OrderServiceError('API_NOT_CONFIGURED', 'API_NOT_CONFIGURED');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (error) {
      const code = error?.name === 'AbortError'
        ? 'API_OFFLINE'
        : (error instanceof TypeError ? 'CORS_ERROR' : 'API_OFFLINE');
      throw new OrderServiceError(code, error?.message || code, { url });
    } finally {
      window.clearTimeout(timeoutId);
    }

    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();
    let body = {};
    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        body = {};
      }
    }
    if (!response.ok || !body.order) {
      throw new OrderServiceError(body.code || 'ORDER_API_ERROR', body.error || 'ORDER_API_ERROR', {
        status: response.status,
        response: body,
        responseText,
        contentType,
        url
      });
    }
    return body.order;
  }

  createLocalOrder(seed, requestBody) {
    const items = Array.isArray(requestBody.items) && requestBody.items.length > 0
      ? requestBody.items.map((item) => {
        const product = this.getCartProduct(item.productSlug || item.seedSlug);
        return product ? { seed: { ...product, commerce: product }, quantity: item.quantity } : null;
      }).filter(Boolean)
      : [{ seed, quantity: requestBody.quantity }];
    const debugProduct = items[0]?.seed || seed;
    if (this.isCheckoutDebugEnabled()) {
      console.info('CHECKOUT_ORDER_CREATE_LOCAL', {
        productSlug: debugProduct?.slug,
        productName: debugProduct?.name,
        category: debugProduct?.category,
        stock: debugProduct?.commerce?.availableStock ?? debugProduct?.availableStock,
        saleEnabled: debugProduct?.commerce?.saleEnabled ?? debugProduct?.saleEnabled,
        stockStatus: debugProduct?.commerce?.stockStatus ?? debugProduct?.stockStatus,
        quantity: requestBody.quantity || requestBody.items,
        customerName: requestBody.customerName,
        customerEmail: requestBody.email,
        robloxUsername: requestBody.robloxUsername,
        couponCode: requestBody.couponCode,
        acceptedTerms: requestBody.termsAccepted,
        orderStorageMode: STORE_COMMERCE_CONFIG.orderStorageMode,
        commerceEnabled: STORE_COMMERCE_CONFIG.commerceEnabled,
        checkoutEnabled: STORE_COMMERCE_CONFIG.testCheckoutEnabled
      });
    }
    const result = this.storeCommerceService.buildCartPixOrder({
      items,
      customerName: requestBody.customerName,
      customerUserId: requestBody.customerUserId,
      email: requestBody.email,
      robloxUsername: requestBody.robloxUsername,
      robloxDisplayName: requestBody.robloxDisplayName,
      couponCode: requestBody.couponCode,
      coupons: this.coupons,
      termsAccepted: requestBody.termsAccepted
    });
    if (!result.ok) {
      throw new OrderServiceError(result.code, result.errors.join(' '));
    }
    try {
      const order = this.localOrderRepository.create({
        ...result.order,
        pixQrImageUrl: null
      });
      if (this.isCheckoutDebugEnabled()) console.info('ORDER_LOCAL_STORAGE', {
        message: 'Pedido salvo no armazenamento local.',
        orderCode: order.orderCode,
        storageMode: order.storageMode
      });
      return order;
    } catch (error) {
      throw new OrderServiceError('LOCAL_STORAGE_ERROR', error?.message || 'LOCAL_STORAGE_ERROR');
    }
  }

  buildPixPaymentPanel(seed, order, state) {
    const hasPixPayload = Boolean(order.pixPayload);
    const orderItems = Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : [{
        productSlug: order.productSlug || order.seedSlug,
        productName: order.productName || order.seedName,
        quantity: order.quantity,
        unitPriceInCents: order.unitPriceInCents,
        subtotalInCents: order.subtotalInCents
      }];
    const fixedPixAmount = Number.isInteger(order.pixChargeAmountInCents) ? order.pixChargeAmountInCents : order.totalInCents;
    const pixValidity = order.pixExpiresAt
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.pixExpiresAt))
      : null;
    const paymentStatusLabel = {
      pending: 'Aguardando pagamento',
      confirmed: 'Pagamento confirmado',
      expired: 'Cobranca expirada',
      cancelled: 'Pagamento cancelado',
      failed: 'Pagamento recusado',
      amount_mismatch: 'Valor divergente. Aguardando revisao.',
      refunded: 'Pagamento reembolsado'
    }[order.paymentStatus] || 'Aguardando pagamento';
    const panel = createElement('section', {
      class: 'pix-payment-section',
      'data-pix-section': seed.slug
    }, [
      createElement('article', { class: 'pix-payment-card' }, [
        createElement('div', { class: 'pix-payment-header' }, [
          createElement('div', {}, [
            createElement('span', { class: 'payment-mode-pill' }, 'Pedido Pix'),
            createElement('h4', {}, 'Pagamento via Pix'),
            createElement('span', { class: 'status-pill' }, 'Aguardando confirmacao')
          ]),
          createElement('div', { class: 'pix-total-box' }, [
            createElement('span', {}, hasPixPayload ? 'Valor fixado pela cobranca:' : 'Total a pagar:'),
            createElement('strong', { class: 'pix-total' }, formatMoney(fixedPixAmount, seed.commerce?.currency || 'BRL'))
          ])
        ]),
        null,
        createElement('div', { class: 'pix-primary-column' }, [
          hasPixPayload
            ? createElement('div', { class: 'pix-qr-panel pix-qr-generated-panel' }, [
              createElement('div', {
                class: 'pix-qr-render-box',
                'data-pix-qr-payload': 'true'
              }, 'Gerando QR Code Pix...'),
              createElement('strong', {}, 'Escaneie o QR Code Pix'),
              createElement('p', {}, 'Abra o app do seu banco, escaneie o QR Code ou copie o codigo Pix abaixo.')
            ])
            : createElement('div', { class: 'pix-brcode-box pending' }, [
              createElement('strong', {}, 'Nao foi possivel gerar a cobranca Pix.'),
              createElement('p', {}, order.pixPayloadError || state.message || 'Tente novamente. Nenhum pagamento manual sera exibido como fallback.'),
              createElement('button', {
                type: 'button',
                class: 'button-secondary',
                'data-action': 'retry-pix',
                disabled: state.pixChargeLoading ? 'disabled' : null
              }, state.pixChargeLoading ? 'Gerando cobranca...' : 'Tentar gerar novamente')
            ]),
          hasPixPayload
            ? createElement('label', { class: 'pix-payload-field' }, [
              createElement('span', {}, 'Pix copia e cola'),
              createElement('textarea', { readonly: true, rows: 5 }, order.pixPayload),
              createElement('button', { type: 'button', class: 'button-secondary', 'data-copy': 'pix-payload' }, 'Copiar codigo Pix')
            ])
            : null,
          createElement('div', { class: 'pix-actions pix-copy-actions' }, [
            createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'pix-back-store' }, 'Fechar')
          ]),
          state.message && !hasPixPayload ? createElement('p', { class: `checkout-message ${state.messageStatus || ''}` }, state.message) : null,
          state.copyMessage ? createElement('p', { class: 'checkout-message success' }, state.copyMessage) : null
        ]),
        createElement('div', { class: 'pix-details-column' }, [
          createElement('div', { class: 'pix-order-details pix-order-grid' }, [
            this.buildPaymentLine('Pedido', order.orderCode),
            this.buildPaymentLine('Produtos', orderItems.map((item) => `${item.quantity}x ${item.productName || item.seedName}`).join(', ')),
            this.buildPaymentLine('Quantidade', String(orderItems.reduce((total, item) => total + Number(item.quantity || 0), 0))),
            this.buildPaymentLine('Subtotal', formatMoney(order.subtotalInCents, seed.commerce?.currency || 'BRL')),
            this.buildPaymentLine('Cupom', order.couponCode || 'Sem cupom'),
            this.buildPaymentLine('Desconto', `-${formatMoney(order.discountInCents, seed.commerce?.currency || 'BRL')}`),
            this.buildPaymentLine('Total a pagar', formatMoney(order.totalInCents, seed.commerce?.currency || 'BRL')),
            hasPixPayload ? this.buildPaymentLine('Valor da cobranca', formatMoney(fixedPixAmount, seed.commerce?.currency || 'BRL')) : null,
            order.paymentId ? this.buildPaymentLine('Cobranca Pix', order.paymentId) : null,
            pixValidity ? this.buildPaymentLine('Validade', pixValidity) : null,
            this.buildPaymentLine('Entrega para', `@${order.robloxUsername}`),
            this.buildPaymentLine('Status', order.customerReportedPayment ? 'Cliente informou que realizou o pagamento. Aguardando confirmacao.' : paymentStatusLabel)
          ]),
          createElement('div', { class: 'pix-instructions' }, [
            createElement('strong', {}, 'Instrucoes de pagamento'),
            createElement('span', {}, hasPixPayload ? 'Pague exatamente o valor indicado usando somente o QR Code ou o copia e cola desta cobranca.' : 'Aguarde a geracao da cobranca Pix.'),
            hasPixPayload ? createElement('span', {}, 'O valor desta cobranca ja esta travado no pedido e nao deve ser alterado no banco.') : null,
            createElement('span', {}, 'O pedido continua aguardando confirmacao ate uma revisao administrativa ou webhook de gateway.')
          ])
        ])
      ])
    ]);

    panel.querySelector('[data-copy="pix-payload"]')?.addEventListener('click', () => this.copyPaymentText(seed.slug, order.pixPayload, 'Codigo Pix copiado!'));
    const qrContainer = panel.querySelector('[data-pix-qr-payload="true"]');
    if (qrContainer && hasPixPayload) {
      renderPixQrCode(qrContainer, order.pixPayload).then((result) => {
        if (!result?.ok) console.warn('PIX_QR_RENDER_ERROR', { reason: result?.reason, orderCode: order.orderCode });
      });
    }
    panel.querySelector('[data-action="retry-pix"]')?.addEventListener('click', () => this.createPixCharge(order, state));
    panel.querySelector('[data-action="report-payment"]')?.addEventListener('click', async () => {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.orderCode)}/report-payment`, {
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.order) {
        Object.assign(order, result.order);
        this.upsertManualOrder(result.order);
        state.message = 'Cliente informou que realizou o pagamento. Status: aguardando confirmacao.';
        state.messageStatus = 'success';
      } else {
        state.message = result.error || 'Nao foi possivel informar o pagamento.';
        state.messageStatus = 'error';
      }
      this.render();
    });
    panel.querySelector('[data-action="pix-back-store"]').addEventListener('click', () => {
      this.clearCheckoutState(seed.slug);
      this.selectedSeedSlug = null;
      this.activeTab = 'sementes';
      this.render();
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    });
    return panel;
  }

  buildPaymentLine(label, value) {
    return createElement('div', { class: 'pix-payment-line' }, [
      createElement('span', {}, label),
      createElement('strong', {}, value)
    ]);
  }

  buildField(name, label, type, value, attrs = {}) {
    return createElement('label', { class: 'checkout-field' }, [
      createElement('span', {}, label),
      createElement('input', { name, type, value, ...attrs })
    ]);
  }

  getCheckoutState(seed) {
    if (!this.checkoutStateBySeed.has(seed.slug)) {
      this.resetCheckoutState(seed);
    }
    return this.checkoutStateBySeed.get(seed.slug);
  }

  resetCheckoutState(seed) {
    const user = this.authService.getCurrentUser();
    this.checkoutStateBySeed.clear();
    this.checkoutStateBySeed.set(seed.slug, {
      open: true,
      quantity: '1',
      customerName: user?.name || '',
      robloxUsername: user?.robloxUsername || '',
      robloxDisplayName: '',
      email: user?.email || '',
      couponCode: '',
      appliedCouponCode: '',
      discountInCents: 0,
      couponMessage: '',
      couponStatus: '',
      termsAccepted: false,
      message: '',
      messageStatus: '',
      copyMessage: '',
      order: null
    });
  }

  clearCheckoutState(seedSlug) {
    this.checkoutStateBySeed.delete(seedSlug);
  }

  closeCheckout(seedSlug) {
    this.clearCheckoutState(seedSlug);
    if (this.selectedSeedSlug === seedSlug) {
      this.selectedSeedSlug = null;
    }
  }

  captureCheckoutState(seedSlug, checkout) {
    const state = this.checkoutStateBySeed.get(seedSlug);
    if (!state) return;
    const form = new FormData(checkout);
    state.quantity = String(form.get('quantity') || '1');
    state.customerName = String(form.get('customerName') || '');
    state.robloxUsername = String(form.get('robloxUsername') || '');
    state.robloxDisplayName = String(form.get('robloxDisplayName') || '');
    state.email = String(form.get('email') || '');
    state.couponCode = String(form.get('couponCode') || '');
    state.termsAccepted = form.get('termsAccepted') === 'on';
    state.order = null;
    state.copyMessage = '';
  }

  getCheckoutQuantityLimit(seed) {
    return Number(seed.commerce?.maxPerOrder || seed.commerce?.availableStock || 1);
  }

  clampCheckoutQuantity(seed, value) {
    const limit = Math.max(1, this.getCheckoutQuantityLimit(seed));
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(parsed, 1), limit);
  }

  changeCheckoutQuantity(seed, checkout, step) {
    this.captureCheckoutState(seed.slug, checkout);
    const state = this.getCheckoutState(seed);
    const currentQuantity = this.clampCheckoutQuantity(seed, state.quantity);
    const nextQuantity = this.clampCheckoutQuantity(seed, currentQuantity + step);
    state.quantity = String(nextQuantity);
    const quantityInput = checkout.querySelector('input[name="quantity"]');
    if (quantityInput) quantityInput.value = state.quantity;
    if (currentQuantity + step > this.getCheckoutQuantityLimit(seed)) {
      state.message = 'Quantidade ajustada ao limite disponivel para este produto.';
      state.messageStatus = 'error';
    } else if (state.messageStatus === 'error' && state.message.includes('Quantidade')) {
      state.message = '';
      state.messageStatus = '';
    }
    this.recalculateAppliedCoupon(seed, state);
    this.updateCheckoutSummary(checkout, seed);
  }

  calculateCheckoutTotals(seed, state) {
    let subtotalInCents = 0;
    try {
      subtotalInCents = calculateSubtotalInCents(seed.commerce?.priceInCents, state.quantity);
    } catch {
      subtotalInCents = 0;
    }
    const discountInCents = Math.min(state.discountInCents || 0, subtotalInCents);
    return {
      subtotalInCents,
      discountInCents,
      totalInCents: Math.max(0, subtotalInCents - discountInCents)
    };
  }

  recalculateAppliedCoupon(seed, state) {
    if (!state.appliedCouponCode) return;
    const coupon = this.coupons.find((item) => normalizeCouponCode(item.code) === normalizeCouponCode(state.appliedCouponCode));
    const totals = this.calculateCheckoutTotals(seed, { ...state, discountInCents: 0 });
    const result = calculateCouponDiscountInCents({
      coupon,
      subtotalInCents: totals.subtotalInCents,
      productSlugs: [seed.slug],
      productCategories: [seed.category],
      productLines: [{
        productSlug: seed.slug,
        productCategory: seed.category,
        subtotalInCents: totals.subtotalInCents
      }]
    });
    console.info('CHECKOUT_COUPON_VALIDATE', {
      code,
      coupon,
      cartItems: [{
        productSlug: seed.slug,
        productName: seed.name,
        category: seed.category,
        subtotalInCents: totals.subtotalInCents
      }],
      result
    });
    if (result.ok) {
      state.discountInCents = result.discountInCents;
      return;
    }
    state.discountInCents = 0;
    state.appliedCouponCode = '';
    state.couponStatus = 'error';
    state.couponMessage = result.reason;
  }

  updateCheckoutSummary(checkout, seed) {
    const state = this.getCheckoutState(seed);
    state.quantity = String(this.clampCheckoutQuantity(seed, state.quantity));
    this.recalculateAppliedCoupon(seed, state);
    const totals = this.calculateCheckoutTotals(seed, state);
    const currency = seed.commerce?.currency || 'BRL';
    const quantityInput = checkout.querySelector('input[name="quantity"]');
    if (quantityInput && quantityInput.value !== state.quantity) quantityInput.value = state.quantity;
    const setText = (selector, value) => {
      const element = checkout.querySelector(selector);
      if (element) element.textContent = value;
    };
    setText('[data-summary="line-total"]', formatMoney(totals.subtotalInCents, currency));
    setText('[data-summary="subtotal"]', formatMoney(totals.subtotalInCents, currency));
    setText('[data-summary="discount"]', formatMoney(totals.discountInCents, currency));
    setText('[data-summary="total"]', formatMoney(totals.totalInCents, currency));
    setText('[data-summary="coupon-state"]', state.appliedCouponCode ? `Cupom ${state.appliedCouponCode} aplicado.` : 'Nenhum cupom aplicado.');
    setText('[data-pay-button="true"]', `Gerar pedido Pix - ${formatMoney(totals.totalInCents, currency)}`);
  }

  applyCoupon(seed) {
    const state = this.getCheckoutState(seed);
    const code = normalizeCouponCode(state.couponCode);
    if (!code) {
      state.couponMessage = 'Informe um cupom para aplicar.';
      state.couponStatus = 'error';
      state.discountInCents = 0;
      state.appliedCouponCode = '';
      return;
    }
    const coupon = this.coupons.find((item) => normalizeCouponCode(item.code) === code);
    const totals = this.calculateCheckoutTotals(seed, { ...state, discountInCents: 0 });
    const result = calculateCouponDiscountInCents({
      coupon,
      subtotalInCents: totals.subtotalInCents,
      productSlugs: [seed.slug],
      productCategories: [seed.category],
      productLines: [{
        productSlug: seed.slug,
        productCategory: seed.category,
        subtotalInCents: totals.subtotalInCents
      }]
    });
    if (!result.ok) {
      state.couponMessage = result.reason;
      state.couponStatus = 'error';
      state.discountInCents = 0;
      state.appliedCouponCode = '';
      return;
    }
    state.couponCode = code;
    state.appliedCouponCode = code;
    state.discountInCents = result.discountInCents;
    state.couponMessage = `Cupom ${code} aplicado.`;
    state.couponStatus = 'success';
  }

  async copyPaymentText(seedSlug, text, message) {
    const state = this.checkoutStateBySeed.get(seedSlug);
    if (!state) return;
    try {
      await navigator.clipboard?.writeText(String(text));
      state.copyMessage = message;
    } catch {
      state.copyMessage = 'Nao foi possivel copiar automaticamente. Selecione e copie manualmente.';
    }
    this.render();
  }

  upsertManualOrder(order) {
    const index = this.manualOrders.findIndex((item) => item.orderCode === order.orderCode);
    if (index >= 0) {
      this.manualOrders[index] = { ...order };
    } else {
      this.manualOrders.unshift({ ...order });
    }
  }

  canOpenCheckout(seed) {
    const canCreate = this.storeCommerceService.canCreateManualPixOrder(seed.commerce);
    if (canCreate.ok) {
      return {
        ok: true,
        reason: STORE_COMMERCE_CONFIG.pix.mode === 'manual'
          ? 'Checkout Pix manual disponivel.'
          : 'Checkout Pix via gateway disponivel.'
      };
    }
    return canCreate;
  }

  isSoldOut(product) {
    const status = String(product?.stockStatus || product?.commerce?.stockStatus || '').toLowerCase();
    const stock = Number.isInteger(product?.availableStock)
      ? product.availableStock
      : product?.commerce?.availableStock;
    return ['sold_out', 'out_of_stock', 'hidden'].includes(status) || (Number.isInteger(stock) && stock <= 0);
  }

  formatCategory(category) {
    const labels = {
      seeds: 'Seeds',
      pets: 'Pets',
      gears: 'Gears',
      packages: 'Pacotes'
    };
    return labels[category] || 'Produto';
  }

  scrollToPendingPix() {
    if (!this.pendingPixScrollSlug) return;
    const slug = this.pendingPixScrollSlug;
    this.pendingPixScrollSlug = null;
    window.setTimeout(() => {
      this.root.querySelector(`[data-pix-section="${slug}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 0);
  }

  buildMoreSection() {
    const cards = [
      ['Sobre o Thur Blox', 'Loja compacta para organizar compras digitais em modo seguro.'],
      ['Como funciona a entrega', 'A entrega e manual, feita apos conferencia do pagamento e do nick Roblox.'],
      ['Politica de reembolso', 'Pedidos digitais seguem regras claras e nao reembolsam simples arrependimento.'],
      ['Termos de compra', 'Confira produto, quantidade e nick antes de gerar o pedido Pix.'],
      ['Privacidade', 'Usamos seus dados apenas para criar pedido e organizar a entrega.'],
      ['Contato', 'Fale com a loja pelo canal combinado apos criar o pedido.']
    ];
    const section = createElement('div', { class: 'more-grid' }, [
      ...cards.map(([title, text]) => createElement('article', { class: 'more-card panel' }, [
        createElement('span', { class: 'category-icon', 'aria-hidden': 'true' }, ''),
        createElement('h2', {}, title),
        createElement('p', {}, text)
      ])),
      createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'go-home' }, 'Voltar ao portal')
    ]);
    section.querySelector('[data-action="go-home"]').addEventListener('click', () => this.onNavigate('home'));
    return section;
  }

  buildAdminSection() {
    if (!this.adminAccess.authorized) {
      return createElement('section', { class: 'store-panel panel admin-denied-panel' }, [
        createElement('span', { class: 'garden-kicker' }, 'Acesso privado'),
        createElement('h2', {}, 'Painel protegido'),
        createElement('p', {}, 'Entre com um e-mail autorizado para acessar suporte, pedidos, estoque e produtos.'),
        createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'go-home-login' }, 'Entrar no portal')
      ]);
    }
    const orders = this.manualOrders;
    const pending = orders.filter((order) => order.paymentStatus === 'pending').length;
    const paid = orders.filter((order) => order.paymentStatus === 'confirmed' || order.orderStatus === 'paid').length;
    const delivered = orders.filter((order) => order.deliveryStatus === 'delivered' || order.orderStatus === 'delivered').length;
    const activeProducts = this.storeProducts.filter((product) => !this.isSoldOut(product)).length;
    const supportUnread = this.supportService.getAdminUnreadCount();
    const section = createElement('div', { class: 'store-panel panel admin-dashboard-shell' }, [
      createElement('header', { class: 'admin-dashboard-header' }, [
        createElement('button', { type: 'button', class: 'admin-back-button', 'data-action': 'admin-back', 'aria-label': 'Voltar ao portal' }, [
          createElement('span', { class: 'admin-back-icon', 'aria-hidden': 'true' }, ''),
          createElement('span', {}, 'Voltar')
        ]),
        createElement('div', { class: 'admin-header-copy' }, [
          createElement('span', { class: 'garden-kicker' }, 'Central de operacoes'),
          createElement('h2', {}, 'Painel Administrativo'),
          createElement('p', {}, 'Gerencie pedidos, estoque, suporte e descontos da Thur Blox')
        ]),
        createElement('div', { class: 'admin-header-account' }, [
          createElement('span', { class: 'admin-store-active' }, 'Loja ativa'),
          createElement('small', {}, this.adminAccess.email || this.adminSession?.email || 'admin'),
          createElement('button', { type: 'button', class: 'button-secondary admin-logout-button', 'data-action': 'admin-logout' }, 'Sair do Admin')
        ])
      ]),
      createElement('div', { class: 'admin-status-grid' }, [
        this.buildAdminStatCard('Total de pedidos', String(orders.length), 'Todos os pedidos registrados', 'orders'),
        this.buildAdminStatCard('Pendentes', String(pending), 'Aguardando pagamento', 'pending'),
        this.buildAdminStatCard('Pagos', String(paid), 'Pagamentos confirmados', 'paid'),
        this.buildAdminStatCard('Entregues', String(delivered), 'Pedidos finalizados', 'delivered'),
        this.buildAdminStatCard('Produtos ativos', String(activeProducts), 'Itens disponiveis na loja', 'products'),
        this.buildAdminStatCard('Cupons ativos', String(this.coupons.filter((coupon) => coupon.active === true).length), 'Descontos disponiveis', 'coupons'),
        this.buildAdminStatCard('Novas mensagens', String(supportUnread), 'Conversas aguardando leitura', 'messages')
      ]),
      this.buildAdminPanelTabs(),
      this.buildAdminPanelContent()
    ]);
    section.querySelector('[data-action="go-home-login"]')?.addEventListener('click', () => this.onNavigate('home'));
    section.querySelector('[data-action="admin-back"]')?.addEventListener('click', () => this.onNavigate('home'));
    section.querySelector('[data-action="admin-logout"]').addEventListener('click', () => this.logoutAdmin());
    section.querySelectorAll('[data-admin-panel-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.adminPanelTab = button.getAttribute('data-admin-panel-tab');
        this.render();
      });
    });
    return section;
  }

  buildAdminPanelTabs() {
    const tabs = [
      ['support', 'Suporte'],
      ['orders', 'Pedidos'],
      ['stock', 'Estoque'],
      ['products', 'Produtos'],
      ['discounts', 'Descontos']
    ];
    return createElement('nav', { class: 'admin-panel-tabs', 'aria-label': 'Secoes administrativas' }, tabs.map(([id, label]) => createElement('button', {
      type: 'button',
      class: `tab-button admin-tab-${id} ${this.adminPanelTab === id ? 'active' : ''}`,
      'data-admin-panel-tab': id,
      'aria-current': this.adminPanelTab === id ? 'page' : null
    }, [
      createElement('span', { class: 'admin-tab-icon', 'aria-hidden': 'true' }, ''),
      createElement('span', {}, label)
    ])));
  }

  buildAdminPanelContent() {
    if (this.adminPanelTab === 'orders') return this.buildAdminOrdersSection();
    if (this.adminPanelTab === 'stock') return this.buildAdminInventorySection();
    if (this.adminPanelTab === 'products') return this.buildAdminProductsSection();
    if (this.adminPanelTab === 'discounts') return this.buildAdminDiscountsSection();
    return this.buildAdminSupportSection();
  }

  buildAdminOrdersSection() {
    const orders = this.manualOrders;
    return createElement('section', { class: 'admin-panel-section' }, [
      createElement('div', { class: 'admin-order-top' }, [
        createElement('div', {}, [
          createElement('span', { class: 'garden-kicker' }, 'Pedidos'),
          createElement('h3', {}, 'Pedidos da loja')
        ]),
        createElement('span', { class: 'status-pill' }, `${orders.length} pedidos`)
      ]),
      orders.length === 0
        ? createElement('div', { class: 'admin-support-empty' }, [
          createElement('strong', {}, 'Nenhum pedido'),
          createElement('p', {}, 'Pedidos criados no checkout aparecem aqui para revisao.')
        ])
        : createElement('div', { class: 'admin-orders' }, orders.map((order) => this.buildAdminOrderCard(order)))
    ]);
  }

  buildAdminStatCard(label, value, description = '', icon = 'orders') {
    return createElement('article', { class: `admin-stat-card admin-stat-${icon}` }, [
      createElement('span', { class: 'admin-stat-icon', 'aria-hidden': 'true' }, ''),
      createElement('div', {}, [
        createElement('small', {}, label),
        createElement('strong', {}, value),
        createElement('p', {}, description)
      ])
    ]);
  }

  buildAdminInventorySection({ kicker = 'Estoque', title = 'Controle de estoque' } = {}) {
    const pendingCount = this.getAdminStockDirtyCount();
    const stockSummary = this.getAdminStockSummary();
    const section = createElement('section', { class: 'admin-panel-section admin-inventory-section' }, [
      createElement('div', { class: 'admin-order-top' }, [
        createElement('div', {}, [
          createElement('span', { class: 'garden-kicker' }, kicker),
          createElement('h3', {}, title)
        ]),
        createElement('span', { class: 'status-pill' }, `${this.storeProducts.length} produtos`)
      ]),
      this.supportAdminMessage ? createElement('p', { class: 'support-admin-notice' }, this.supportAdminMessage) : null,
      createElement('div', { class: 'admin-stock-summary' }, [
        this.buildAdminStockSummaryItem('Produtos', String(stockSummary.totalProducts)),
        this.buildAdminStockSummaryItem('Disponiveis', String(stockSummary.availableProducts)),
        this.buildAdminStockSummaryItem('Esgotados', String(stockSummary.soldOutProducts)),
        this.buildAdminStockSummaryItem('Ocultos', String(stockSummary.hiddenProducts)),
        this.buildAdminStockSummaryItem('Pendentes', String(pendingCount))
      ]),
      createElement('div', { class: 'admin-stock-actions', 'data-stock-bulk-bar': 'true' }, [
        createElement('span', { class: 'admin-stock-pending-count', 'data-stock-pending-count': 'true' }, `${pendingCount} alteracoes pendentes`),
        createElement('div', { class: 'admin-stock-action-buttons' }, [
          createElement('button', {
            type: 'button',
            class: 'button-primary',
            'data-action': 'save-all-stock',
            disabled: pendingCount === 0 || this.adminStockSaving ? 'disabled' : null
          }, this.adminStockSaving && !this.adminStockSavingSlug ? 'Salvando...' : pendingCount > 0 ? `Salvar alteracoes (${pendingCount})` : 'Salvar alteracoes')
        ])
      ]),
      createElement('div', { class: 'admin-stock-groups' }, this.getStoreCategories().map((category) => {
        const products = this.storeProducts.filter((product) => product.category === category.key);
        return createElement('div', { class: 'admin-stock-group' }, [
          createElement('h4', {}, this.formatCategory(category.key)),
          createElement('div', { class: 'admin-stock-list' }, products.map((product) => this.buildAdminStockCard(product)))
        ]);
      }))
    ]);
    section.querySelectorAll('[data-stock-form]').forEach((form) => {
      form.addEventListener('submit', (event) => this.saveAdminStock(event));
      form.addEventListener('input', (event) => this.updateAdminStockDraft(form, event.target?.name || ''));
      form.addEventListener('change', (event) => this.updateAdminStockDraft(form, event.target?.name || ''));
    });
    section.querySelector('[data-action="save-all-stock"]')?.addEventListener('click', () => this.saveAllAdminStock(section));
    return section;
  }

  buildAdminStockCard(product) {
    const draft = this.getAdminStockDraft(product);
    const isDirty = this.isAdminStockDraftDirty(product, draft);
    const error = this.adminStockErrors[product.slug] || '';
    const savingThisProduct = this.adminStockSavingSlug === product.slug;
    return createElement('form', { class: `admin-stock-card ${isDirty ? 'has-pending-changes' : ''} ${error ? 'has-stock-error' : ''}`, 'data-stock-form': product.slug }, [
      createElement('img', { src: product.image, alt: '', loading: 'lazy' }),
      createElement('div', { class: 'admin-stock-copy' }, [
        createElement('strong', {}, product.name),
        createElement('span', {}, `${this.formatCategory(product.category)} · ${formatMoney(product.salePriceInCents, product.currency || 'BRL')}`),
        createElement('small', { 'data-stock-state-label': product.slug }, this.getAdminStockStateLabel(draft)),
        createElement('em', { class: 'admin-stock-pending-badge', 'data-stock-pending-badge': product.slug, hidden: isDirty ? null : 'hidden' }, 'Alteracao pendente'),
        createElement('small', { class: 'admin-stock-error', 'data-stock-error': product.slug, hidden: error ? null : 'hidden' }, error)
      ]),
      createElement('label', { class: 'admin-stock-field' }, [
        createElement('span', {}, 'Estoque'),
        createElement('input', {
          type: 'number',
          name: 'availableStock',
          min: '0',
          step: '1',
          value: String(draft.availableStock),
          required: 'required'
        })
      ]),
      createElement('label', { class: 'admin-stock-check' }, [
        createElement('input', {
          type: 'checkbox',
          name: 'saleEnabled',
          checked: draft.saleEnabled === true ? 'checked' : null
        }),
        createElement('span', {}, 'Venda ativa')
      ]),
      createElement('label', { class: 'admin-stock-field' }, [
          createElement('span', {}, 'Status'),
          createElement('select', { name: 'stockStatus' }, [
            createElement('option', { value: 'available', selected: draft.stockStatus === 'available' ? 'selected' : null }, 'Disponivel'),
          createElement('option', { value: 'out_of_stock', selected: draft.stockStatus === 'out_of_stock' ? 'selected' : null }, 'Esgotado'),
          createElement('option', { value: 'hidden', selected: draft.stockStatus === 'hidden' ? 'selected' : null }, 'Oculto')
        ])
      ]),
      createElement('button', { type: 'submit', class: 'button-secondary admin-stock-save-one', disabled: this.adminStockSaving ? 'disabled' : null }, savingThisProduct ? 'Salvando...' : 'Salvar')
    ]);
  }

  buildAdminStockSummaryItem(label, value) {
    return createElement('span', { class: 'admin-stock-summary-item' }, [
      createElement('small', {}, label),
      createElement('strong', {}, value)
    ]);
  }

  getAdminStockSummary() {
    const availableProducts = this.storeProducts.filter((product) => {
      const draft = this.getAdminStockDraft(product);
      const stock = Number.parseInt(draft.availableStock, 10);
      return Number.isInteger(stock) && stock > 0 && draft.saleEnabled === true && draft.stockStatus === 'available';
    }).length;
    const hiddenProducts = this.storeProducts.filter((product) => this.getAdminStockDraft(product).stockStatus === 'hidden').length;
    return {
      totalProducts: this.storeProducts.length,
      availableProducts,
      hiddenProducts,
      soldOutProducts: this.storeProducts.length - availableProducts - hiddenProducts
    };
  }

  getAdminStockStateLabel(draft) {
    const stock = Number.parseInt(draft.availableStock, 10);
    if (draft.stockStatus === STOCK_STATUS.HIDDEN) return 'Produto oculto';
    if (Number.isInteger(stock) && stock > 0 && draft.saleEnabled === true && draft.stockStatus === STOCK_STATUS.AVAILABLE) {
      return 'Venda ativa';
    }
    return 'Venda desativada';
  }

  getAdminStockOriginal(product) {
    const normalized = normalizeStockState({
      availableStock: Number.isInteger(product.availableStock)
        ? product.availableStock
        : Number.isInteger(product.commerce?.availableStock) ? product.commerce.availableStock : 0,
      saleEnabled: product.saleEnabled === true || product.commerce?.saleEnabled === true,
      stockStatus: product.stockStatus || product.commerce?.stockStatus
    });
    return {
      availableStock: String(normalized.availableStock),
      saleEnabled: normalized.saleEnabled,
      stockStatus: normalized.stockStatus
    };
  }

  getAdminStockDraft(product) {
    return this.adminStockDrafts[product.slug] || this.getAdminStockOriginal(product);
  }

  isAdminStockDraftDirty(product, draft = this.getAdminStockDraft(product)) {
    const original = this.getAdminStockOriginal(product);
    return String(draft.availableStock ?? '').trim() !== original.availableStock
      || (draft.saleEnabled === true) !== original.saleEnabled
      || String(draft.stockStatus || '') !== original.stockStatus;
  }

  getAdminStockDirtyCount() {
    return this.storeProducts.filter((product) => this.isAdminStockDraftDirty(product)).length;
  }

  collectAdminStockFormValues(form) {
    return this.normalizeAdminStockDraft({
      availableStock: form.elements.availableStock.value,
      saleEnabled: form.elements.saleEnabled.checked,
      stockStatus: form.elements.stockStatus.value
    });
  }

  normalizeAdminStockDraft(draft, changedField = '') {
    const value = String(draft.availableStock ?? '').trim();
    const stock = /^\d+$/.test(value) ? Number(value) : null;
    const requestedStatus = normalizeStockStatusValue(draft.stockStatus);
    if (stock == null) {
      return {
        availableStock: value,
        saleEnabled: draft.saleEnabled === true,
        stockStatus: requestedStatus
      };
    }
    if (requestedStatus === STOCK_STATUS.HIDDEN) {
      return {
        availableStock: value,
        saleEnabled: false,
        stockStatus: STOCK_STATUS.HIDDEN
      };
    }
    if (stock <= 0) {
      return {
        availableStock: value,
        saleEnabled: false,
        stockStatus: STOCK_STATUS.OUT_OF_STOCK
      };
    }
    if (changedField === 'stockStatus' && requestedStatus === STOCK_STATUS.AVAILABLE) {
      return {
        availableStock: value,
        saleEnabled: true,
        stockStatus: STOCK_STATUS.AVAILABLE
      };
    }
    if (changedField === 'stockStatus' && requestedStatus === STOCK_STATUS.OUT_OF_STOCK) {
      return {
        availableStock: value,
        saleEnabled: false,
        stockStatus: STOCK_STATUS.OUT_OF_STOCK
      };
    }
    if (changedField === 'saleEnabled') {
      return {
        availableStock: value,
        saleEnabled: draft.saleEnabled === true,
        stockStatus: draft.saleEnabled === true ? STOCK_STATUS.AVAILABLE : STOCK_STATUS.OUT_OF_STOCK
      };
    }
    if (draft.saleEnabled === true || requestedStatus === STOCK_STATUS.AVAILABLE) {
      return {
        availableStock: value,
        saleEnabled: true,
        stockStatus: STOCK_STATUS.AVAILABLE
      };
    }
    return {
      availableStock: value,
      saleEnabled: false,
      stockStatus: STOCK_STATUS.OUT_OF_STOCK
    };
  }

  updateAdminStockDraft(form, changedField = '') {
    const productSlug = form.getAttribute('data-stock-form');
    const product = this.storeProducts.find((item) => item.slug === productSlug);
    if (!product) return;
    const draft = this.normalizeAdminStockDraft({
      availableStock: form.elements.availableStock.value,
      saleEnabled: form.elements.saleEnabled.checked,
      stockStatus: form.elements.stockStatus.value
    }, changedField);
    form.elements.availableStock.value = draft.availableStock;
    form.elements.saleEnabled.checked = draft.saleEnabled;
    form.elements.stockStatus.value = draft.stockStatus;
    if (this.isAdminStockDraftDirty(product, draft)) {
      this.adminStockDrafts[productSlug] = draft;
    } else {
      delete this.adminStockDrafts[productSlug];
    }
    this.logAdminStockDebug('draft atualizado pelo input', {
      productSlug,
      changedField,
      draft
    });
    delete this.adminStockErrors[productSlug];
    this.refreshAdminStockFormState(form);
    this.refreshAdminStockActionBar(form.closest('.admin-inventory-section'));
  }

  refreshAdminStockFormState(form) {
    const productSlug = form.getAttribute('data-stock-form');
    const product = this.storeProducts.find((item) => item.slug === productSlug);
    if (!product) return;
    const draft = this.adminStockDrafts[productSlug] || this.collectAdminStockFormValues(form);
    const isDirty = this.isAdminStockDraftDirty(product, draft);
    const error = this.adminStockErrors[productSlug] || '';
    form.classList.toggle('has-pending-changes', isDirty);
    form.classList.toggle('has-stock-error', Boolean(error));
    const badge = form.querySelector('[data-stock-pending-badge]');
    if (badge) badge.hidden = !isDirty;
    const errorNode = form.querySelector('[data-stock-error]');
    if (errorNode) {
      errorNode.hidden = !error;
      errorNode.textContent = error;
    }
    const stateLabel = form.querySelector('[data-stock-state-label]');
    if (stateLabel) stateLabel.textContent = this.getAdminStockStateLabel(draft);
    const saveButton = form.querySelector('.admin-stock-save-one');
    if (saveButton) {
      const savingThisProduct = this.adminStockSavingSlug === productSlug;
      saveButton.disabled = this.adminStockSaving;
      saveButton.textContent = savingThisProduct ? 'Salvando...' : 'Salvar';
    }
  }

  refreshAdminStockActionBar(section) {
    if (!section) return;
    const pendingCount = this.getAdminStockDirtyCount();
    const stockSummary = this.getAdminStockSummary();
    const countNode = section.querySelector('[data-stock-pending-count]');
    if (countNode) countNode.textContent = `${pendingCount} alteracoes pendentes`;
    const summaryNodes = section.querySelectorAll('.admin-stock-summary-item strong');
    [stockSummary.totalProducts, stockSummary.availableProducts, stockSummary.soldOutProducts, stockSummary.hiddenProducts, pendingCount]
      .forEach((value, index) => {
        if (summaryNodes[index]) summaryNodes[index].textContent = String(value);
      });
    const saveButton = section.querySelector('[data-action="save-all-stock"]');
    if (saveButton) {
      saveButton.disabled = pendingCount === 0 || this.adminStockSaving;
      saveButton.textContent = this.adminStockSaving && !this.adminStockSavingSlug ? 'Salvando...' : pendingCount > 0 ? `Salvar alteracoes (${pendingCount})` : 'Salvar alteracoes';
    }
  }

  syncAdminStockForms(section) {
    section?.querySelectorAll('[data-stock-form]').forEach((form) => this.updateAdminStockDraft(form));
  }

  getAdminStockPendingChanges() {
    const changes = {};
    this.storeProducts.forEach((product) => {
      const draft = this.adminStockDrafts[product.slug];
      if (draft && this.isAdminStockDraftDirty(product, draft)) changes[product.slug] = draft;
    });
    return changes;
  }

  validateAdminStockChanges(changes) {
    const errors = {};
    Object.entries(changes).forEach(([productSlug, change]) => {
      try {
        this.inventoryOverrideService.validateProductOverride(change);
      } catch (error) {
        errors[productSlug] = error.message || 'Revise os dados deste produto.';
      }
    });
    return errors;
  }

  shouldLogAdminStockDebug() {
    if (typeof window === 'undefined') return false;
    return window.location?.hostname === '127.0.0.1'
      || window.location?.hostname === 'localhost'
      || window.localStorage?.getItem('thur_blox_debug_stock') === 'true';
  }

  logAdminStockDebug(message, details = {}) {
    if (!this.shouldLogAdminStockDebug() || typeof console === 'undefined') return;
    console.debug('[Thur Blox estoque]', message, details);
  }

  hydrateStoreProducts(products) {
    return this.inventoryOverrideService.applyToProducts((products || []).map((product) => {
      const { commerce: _commerce, ...baseProduct } = product;
      return {
        ...baseProduct,
        commerce: this.storeCommerceService.normalizeStoreProduct(baseProduct)
      };
    }));
  }

  async updateProductStock(productSlug, changes) {
    const before = this.storeProducts.find((product) => product.slug === productSlug) || null;
    this.logAdminStockDebug('antes de salvar produto', {
      productSlug,
      before: before ? {
        availableStock: before.availableStock,
        saleEnabled: before.saleEnabled,
        stockStatus: before.stockStatus,
        commerce: before.commerce ? {
          availableStock: before.commerce.availableStock,
          saleEnabled: before.commerce.saleEnabled,
          stockStatus: before.commerce.stockStatus
        } : null
      } : null,
      changes
    });
    const result = await this.saveAdminStockChangesToSource({ [productSlug]: changes });
    this.logAdminStockDebug('resposta do salvamento', {
      productSlug,
      source: result.source,
      saved: result.saved?.[productSlug] || null,
      error: result.errors?.[productSlug] || result.errors?.general || null
    });
    const after = this.storeProducts.find((product) => product.slug === productSlug) || null;
    this.logAdminStockDebug('estado apos salvar produto', {
      productSlug,
      after: after ? {
        availableStock: after.availableStock,
        saleEnabled: after.saleEnabled,
        stockStatus: after.stockStatus,
        commerce: after.commerce ? {
          availableStock: after.commerce.availableStock,
          saleEnabled: after.commerce.saleEnabled,
          stockStatus: after.commerce.stockStatus
        } : null
      } : null
    });
    return result;
  }

  async saveAdminStockChangesToSource(changes) {
    if (typeof fetch === 'function') {
      try {
        this.logAdminStockDebug('payload enviado para API de estoque', {
          endpoint: '/api/admin/products/stock',
          changes
        });
        const response = await fetch('/api/admin/products/stock', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes })
        });
        if (response.status !== 404 && response.status !== 405) {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            return {
              saved: data.saved || {},
              errors: data.errors || { general: data.error || 'Nao foi possivel salvar na base central.' },
              source: 'api'
            };
          }
          this.inventoryOverrideService.removeOverrides(Object.keys(data.saved || {}));
          if (Array.isArray(data.products)) {
            this.storeCommerceService.cache = null;
            this.storeProducts = this.hydrateStoreProducts(data.products);
          }
          return {
            saved: data.saved || {},
            errors: data.errors || {},
            source: 'api'
          };
        }
      } catch (error) {
        this.logAdminStockDebug('falha na API de estoque; tentando fallback local', {
          storageKey: 'thur_blox_inventory_overrides_v1',
          error: error.message || String(error)
        });
        // Fallback local keeps the admin usable when the static API is unavailable.
      }
    }
    return {
      ...this.inventoryOverrideService.saveProductOverrides(changes),
      source: 'localStorage'
    };
  }

  refreshStoreAfterInventorySave() {
    this.storeProducts = this.inventoryOverrideService.applyToProducts(this.storeProducts);
    this.cartItems = this.cartService.save(this.cartItems.map((item) => {
      const product = this.getCartProduct(item.productSlug);
      return product ? { ...item, quantity: this.clampCartQuantity(product, item.quantity) } : item;
    }));
    this.recalculateCartCoupon();
  }

  buildAdminProductsSection() {
    return this.buildAdminInventorySection({
      kicker: 'Produtos',
      title: 'Produtos cadastrados'
    });
  }

  async saveAdminStock(event) {
    event.preventDefault();
    if (this.adminStockSaving) return;
    const form = event.currentTarget;
    const productSlug = String(form.getAttribute('data-stock-form') || '').trim();
    if (!productSlug) {
      this.supportAdminMessage = 'Produto sem identificador valido.';
      this.render();
      return;
    }
    this.updateAdminStockDraft(form);
    const product = this.storeProducts.find((item) => item.slug === productSlug);
    if (!product) {
      this.adminStockErrors[productSlug] = `Produto nao encontrado na lista carregada: ${productSlug}.`;
      this.supportAdminMessage = this.adminStockErrors[productSlug];
      this.refreshAdminStockFormState(form);
      this.refreshAdminStockActionBar(form.closest('.admin-inventory-section'));
      return;
    }
    const draft = this.adminStockDrafts[productSlug] || (product ? this.getAdminStockDraft(product) : this.collectAdminStockFormValues(form));
    const change = {
      availableStock: draft.availableStock,
      saleEnabled: draft.saleEnabled === true,
      stockStatus: draft.stockStatus
    };
    const validationErrors = this.validateAdminStockChanges({ [productSlug]: change });
    if (validationErrors[productSlug]) {
      this.adminStockErrors[productSlug] = validationErrors[productSlug];
      this.supportAdminMessage = 'Revise o estoque deste produto antes de salvar.';
      this.refreshAdminStockFormState(form);
      this.refreshAdminStockActionBar(form.closest('.admin-inventory-section'));
      return;
    }
    this.adminStockSaving = true;
    this.adminStockSavingSlug = productSlug;
    this.refreshAdminStockFormState(form);
    this.refreshAdminStockActionBar(form.closest('.admin-inventory-section'));
    try {
      const { saved, errors, source } = await this.updateProductStock(productSlug, change);
      if (errors?.[productSlug] || errors?.general) {
        throw new Error(errors[productSlug] || errors.general);
      }
      if (!saved?.[productSlug]) {
        throw new Error(`A API nao confirmou o salvamento de ${product.name || productSlug}.`);
      }
      if (source !== 'api') {
        this.refreshStoreAfterInventorySave();
      }
      delete this.adminStockDrafts[productSlug];
      delete this.adminStockErrors[productSlug];
      this.supportAdminMessage = source === 'api'
        ? 'Estoque salvo na base central. Loja, carrinho e checkout ja usam os novos valores.'
        : 'Estoque salvo localmente. Loja, carrinho e checkout ja usam os novos valores neste navegador.';
    } catch (error) {
      this.adminStockErrors[productSlug] = error.message || 'Nao foi possivel salvar este produto.';
      this.supportAdminMessage = error.message || 'Nao foi possivel salvar o estoque.';
    } finally {
      this.adminStockSaving = false;
      this.adminStockSavingSlug = '';
    }
    this.render();
  }

  async saveAllAdminStock(section) {
    this.syncAdminStockForms(section);
    const changes = this.getAdminStockPendingChanges();
    const pendingCount = Object.keys(changes).length;
    if (pendingCount === 0 || this.adminStockSaving) return;
    if (pendingCount > 10 && typeof window !== 'undefined' && !window.confirm(`Voce esta prestes a salvar ${pendingCount} alteracoes de estoque. Deseja continuar?`)) {
      return;
    }

    const validationErrors = this.validateAdminStockChanges(changes);
    if (Object.keys(validationErrors).length > 0) {
      this.adminStockErrors = { ...this.adminStockErrors, ...validationErrors };
      this.supportAdminMessage = 'Revise os produtos destacados antes de salvar.';
      this.render();
      return;
    }

    this.adminStockSaving = true;
    this.adminStockSavingSlug = '';
    this.refreshAdminStockActionBar(section);
    try {
      const { saved, errors, source } = await this.saveAdminStockChangesToSource(changes);
      Object.keys(saved).forEach((productSlug) => {
        delete this.adminStockDrafts[productSlug];
        delete this.adminStockErrors[productSlug];
      });
      this.adminStockErrors = { ...this.adminStockErrors, ...errors };
      if (source !== 'api') {
        this.refreshStoreAfterInventorySave();
      } else {
        this.cartItems = this.cartService.save(this.cartItems.map((item) => {
          const product = this.getCartProduct(item.productSlug);
          return product ? { ...item, quantity: this.clampCartQuantity(product, item.quantity) } : item;
        }));
        this.recalculateCartCoupon();
      }
      const savedCount = Object.keys(saved).length;
      const failedSlugs = Object.keys(errors);
      if (failedSlugs.length > 0) {
        const failedNames = failedSlugs.map((slug) => this.storeProducts.find((product) => product.slug === slug)?.name || slug);
        this.supportAdminMessage = `${savedCount} produtos salvos. ${failedSlugs.length} falharam: ${failedNames.join(', ')}.`;
      } else {
        this.supportAdminMessage = source === 'api'
          ? `${savedCount} produtos salvos na base central com sucesso.`
          : `${savedCount} produtos salvos localmente com sucesso.`;
      }
    } catch (error) {
      this.supportAdminMessage = error.message || 'Falha ao persistir os produtos.';
    } finally {
      this.adminStockSaving = false;
      this.adminStockSavingSlug = '';
    }
    this.render();
  }

  buildAdminDiscountsSection() {
    const coupons = this.couponAdminService.list();
    const editing = coupons.find((coupon) => coupon.id === this.editingCouponId) || null;
    const section = createElement('section', { class: 'admin-panel-section admin-discounts-section' }, [
      createElement('div', { class: 'admin-order-top' }, [
        createElement('div', {}, [
          createElement('span', { class: 'garden-kicker' }, 'Descontos'),
          createElement('h3', {}, 'Cupons da loja')
        ]),
        createElement('span', { class: 'status-pill' }, `${coupons.length} cupons`)
      ]),
      this.supportAdminMessage ? createElement('p', { class: 'support-admin-notice' }, this.supportAdminMessage) : null,
      this.buildCouponForm(editing),
      createElement('div', { class: 'admin-coupon-list' }, coupons.length === 0
        ? [createElement('div', { class: 'admin-support-empty' }, [
          createElement('strong', {}, 'Nenhum cupom criado'),
          createElement('p', {}, 'Crie PROMO10, DESCONTO5 ou outro desconto para liberar no checkout.')
        ])]
        : coupons.map((coupon) => this.buildCouponCard(coupon)))
    ]);

    section.querySelector('[data-coupon-form]').addEventListener('submit', (event) => this.saveAdminCoupon(event));
    section.querySelector('[data-action="cancel-coupon-edit"]')?.addEventListener('click', () => {
      this.editingCouponId = '';
      this.supportAdminMessage = '';
      this.render();
    });
    section.querySelectorAll('[data-coupon-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        this.editingCouponId = button.getAttribute('data-coupon-edit');
        this.supportAdminMessage = '';
        this.render();
      });
    });
    section.querySelectorAll('[data-coupon-toggle]').forEach((button) => {
      button.addEventListener('click', () => this.toggleAdminCoupon(button.getAttribute('data-coupon-toggle')));
    });
    section.querySelectorAll('[data-coupon-archive]').forEach((button) => {
      button.addEventListener('click', () => this.archiveAdminCoupon(button.getAttribute('data-coupon-archive')));
    });
    return section;
  }

  buildCouponForm(coupon) {
    const selectedCategories = new Set(coupon?.applicableCategories || coupon?.appliesTo?.categories || ['seeds', 'pets', 'gears', 'packages']);
    const selectedProducts = new Set(coupon?.applicableProductSlugs || coupon?.appliesTo?.productSlugs || []);
    const discountType = coupon?.discountType || 'percentage';
    return createElement('form', { class: 'admin-coupon-form', 'data-coupon-form': 'true' }, [
      createElement('input', { type: 'hidden', name: 'id', value: coupon?.id || '' }),
      createElement('div', { class: 'admin-coupon-form-grid' }, [
        this.buildAdminFormField('Codigo do cupom', 'code', 'text', coupon?.code || '', { required: true, placeholder: 'PROMO10' }),
        this.buildAdminFormField('Descricao', 'description', 'text', coupon?.description || '', { placeholder: '10% de desconto' }),
        createElement('label', { class: 'admin-stock-field' }, [
          createElement('span', {}, 'Tipo de desconto'),
          createElement('select', { name: 'discountType' }, [
            createElement('option', { value: 'percentage', selected: discountType === 'percentage' ? 'selected' : null }, 'Porcentagem'),
            createElement('option', { value: 'fixed', selected: discountType === 'fixed' ? 'selected' : null }, 'Valor fixo em centavos')
          ])
        ]),
        this.buildAdminFormField('Valor', 'discountValue', 'number', String(coupon?.discountType === 'fixed' ? coupon?.amountInCents || coupon?.discountValue || '' : coupon?.value || coupon?.discountValue || ''), { required: true, min: '1', step: '1', placeholder: '10 ou 500' }),
        this.buildAdminFormField('Data de inicio', 'startsAt', 'date', coupon?.startsAt || ''),
        this.buildAdminFormField('Data de expiracao', 'expiresAt', 'date', coupon?.expiresAt || ''),
        this.buildAdminFormField('Limite total de usos', 'maxUses', 'number', coupon?.maxUses ?? coupon?.totalUsageLimit ?? '', { min: '0', step: '1' }),
        this.buildAdminFormField('Limite por cliente', 'maxUsesPerCustomer', 'number', coupon?.maxUsesPerCustomer ?? coupon?.usageLimitPerCustomer ?? '1', { min: '0', step: '1' })
      ]),
      createElement('fieldset', { class: 'admin-coupon-checks' }, [
        createElement('legend', {}, 'Categorias aplicaveis'),
        ...this.getStoreCategories().map((category) => createElement('label', { class: 'admin-stock-check' }, [
          createElement('input', {
            type: 'checkbox',
            name: 'categories',
            value: category.key,
            checked: selectedCategories.has(category.key) ? 'checked' : null
          }),
          createElement('span', {}, this.formatCategory(category.key))
        ]))
      ]),
      createElement('label', { class: 'admin-stock-field' }, [
        createElement('span', {}, 'Produtos especificos'),
        createElement('select', { name: 'productSlugs', multiple: 'multiple', size: '5' }, this.storeProducts.map((product) => createElement('option', {
          value: product.slug,
          selected: selectedProducts.has(product.slug) ? 'selected' : null
        }, `${product.name} (${this.formatCategory(product.category)})`)))
      ]),
      createElement('p', { class: 'support-admin-notice' }, 'Este cupom sera aplicado a produtos das categorias selecionadas ou aos produtos especificos selecionados.'),
      createElement('label', { class: 'admin-stock-check' }, [
        createElement('input', { type: 'checkbox', name: 'active', checked: coupon?.active === true ? 'checked' : null }),
        createElement('span', {}, 'Cupom ativo')
      ]),
      createElement('div', { class: 'admin-support-actions' }, [
        coupon ? createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'cancel-coupon-edit' }, 'Cancelar edicao') : null,
        createElement('button', { type: 'submit', class: 'button-primary' }, 'Salvar desconto')
      ])
    ]);
  }

  buildAdminFormField(label, name, type, value, attrs = {}) {
    return createElement('label', { class: 'admin-stock-field' }, [
      createElement('span', {}, label),
      createElement('input', {
        type,
        name,
        value: value == null ? '' : String(value),
        required: attrs.required ? 'required' : null,
        min: attrs.min,
        step: attrs.step,
        placeholder: attrs.placeholder
      })
    ]);
  }

  buildCouponCard(coupon) {
    const categories = coupon.applicableCategories || coupon.appliesTo?.categories || [];
    const products = coupon.applicableProductSlugs || coupon.appliesTo?.productSlugs || [];
    const valueLabel = coupon.discountType === 'fixed'
      ? formatMoney(coupon.discountValue || coupon.amountInCents, 'BRL')
      : `${coupon.discountValue || coupon.value}%`;
    return createElement('article', { class: 'admin-coupon-card' }, [
      createElement('div', {}, [
        createElement('strong', {}, coupon.code),
        createElement('p', {}, coupon.description || 'Sem descricao')
      ]),
      createElement('div', { class: 'admin-coupon-meta' }, [
        createElement('span', {}, coupon.discountType === 'fixed' ? 'Valor fixo' : 'Porcentagem'),
        createElement('span', {}, valueLabel),
        createElement('span', { class: 'status-pill' }, coupon.active ? 'Ativo' : 'Inativo'),
        createElement('span', {}, `Validade: ${coupon.startsAt || 'agora'} ate ${coupon.expiresAt || 'sem fim'}`),
        createElement('span', {}, `Usos: ${coupon.usedCount || 0}${Number.isInteger(coupon.maxUses) ? `/${coupon.maxUses}` : ''}`),
        createElement('span', {}, `Categorias: ${categories.length ? categories.map((category) => this.formatCategory(category)).join(', ') : 'Todas'}`),
        createElement('span', {}, `Produtos: ${products.length ? products.join(', ') : 'Todos'}`),
        createElement('span', {}, `Criado por: ${coupon.createdBy || 'admin'}`)
      ]),
      createElement('div', { class: 'admin-support-actions' }, [
        createElement('button', { type: 'button', class: 'button-secondary', 'data-coupon-edit': coupon.id }, 'Editar'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-coupon-toggle': coupon.id }, coupon.active ? 'Desativar' : 'Ativar'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-coupon-archive': coupon.id }, 'Arquivar')
      ])
    ]);
  }

  async refreshCoupons() {
    this.storeCommerceService.couponsCache = null;
    this.coupons = await this.storeCommerceService.loadCoupons();
    this.recalculateCartCoupon();
    this.checkoutStateBySeed.forEach((state, slug) => {
      if (state.appliedCouponCode) {
        const product = this.storeProducts.find((item) => item.slug === slug);
        if (product) this.recalculateAppliedCoupon(product, state);
      }
    });
  }

  async saveAdminCoupon(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const selectedOptions = Array.from(form.querySelector('select[name="productSlugs"]').selectedOptions).map((option) => option.value);
    try {
      this.couponAdminService.upsert({
        id: data.get('id'),
        code: data.get('code'),
        description: data.get('description'),
        discountType: data.get('discountType'),
        discountValue: data.get('discountValue'),
        startsAt: data.get('startsAt'),
        expiresAt: data.get('expiresAt'),
        maxUses: data.get('maxUses'),
        maxUsesPerCustomer: data.get('maxUsesPerCustomer'),
        categories: data.getAll('categories'),
        productSlugs: selectedOptions,
        active: data.get('active') === 'on'
      }, {
        products: this.storeProducts,
        adminEmail: this.adminAccess.email || this.adminSession?.email || 'admin'
      });
      this.editingCouponId = '';
      await this.refreshCoupons();
      this.supportAdminMessage = 'Desconto salvo e disponivel para validacao no checkout.';
    } catch (error) {
      this.supportAdminMessage = error.message || 'Nao foi possivel salvar o desconto.';
    }
    this.render();
  }

  async toggleAdminCoupon(couponId) {
    try {
      this.couponAdminService.toggle(couponId);
      await this.refreshCoupons();
      this.supportAdminMessage = 'Status do cupom atualizado.';
    } catch (error) {
      this.supportAdminMessage = error.message || 'Nao foi possivel atualizar o cupom.';
    }
    this.render();
  }

  async archiveAdminCoupon(couponId) {
    try {
      this.couponAdminService.archive(couponId);
      await this.refreshCoupons();
      this.supportAdminMessage = 'Cupom arquivado.';
    } catch (error) {
      this.supportAdminMessage = error.message || 'Nao foi possivel arquivar o cupom.';
    }
    this.render();
  }

  buildAdminSupportSection() {
    const conversations = this.supportService.listAdminConversations();
    const selectedId = conversations.some((conversation) => conversation.id === this.selectedSupportConversationId)
      ? this.selectedSupportConversationId
      : conversations[0]?.id;
    const selectedConversation = selectedId ? this.supportService.getConversation(selectedId) : null;
    const section = createElement('section', { class: 'admin-support-section' }, [
      createElement('div', { class: 'admin-order-top' }, [
        createElement('div', {}, [
          createElement('span', { class: 'garden-kicker' }, 'Suporte'),
          createElement('h3', {}, 'Mensagens dos clientes')
        ]),
        createElement('span', { class: 'status-pill' }, `${conversations.length} conversas`)
      ]),
      this.supportAdminMessage ? createElement('p', { class: 'support-admin-notice' }, this.supportAdminMessage) : null,
      conversations.length === 0
        ? createElement('div', { class: 'admin-support-empty' }, [
          createElement('span', { class: 'admin-empty-chat-icon', 'aria-hidden': 'true' }, ''),
          createElement('strong', {}, 'Nenhuma mensagem ainda'),
          createElement('p', {}, 'Quando um cliente chamar no chat, a conversa aparecera aqui.')
        ])
        : createElement('div', { class: 'admin-support-layout' }, [
          createElement('div', { class: 'admin-support-list' }, conversations.map((conversation) => this.buildAdminSupportConversationCard(conversation, conversation.id === selectedId))),
          selectedConversation ? this.buildAdminSupportDetail(selectedConversation) : null
        ])
    ]);

    section.querySelectorAll('[data-support-select]').forEach((button) => {
      button.addEventListener('click', () => this.selectAdminSupportConversation(button.getAttribute('data-support-select')));
    });
    section.querySelector('[data-support-action="reply"]')?.addEventListener('submit', (event) => this.replyToSupportConversation(event));
    section.querySelector('[data-support-action="resolve"]')?.addEventListener('click', () => this.resolveSupportConversation(selectedConversation?.id));
    section.querySelector('[data-support-action="close"]')?.addEventListener('click', () => this.closeSupportConversation(selectedConversation?.id));
    return section;
  }

  buildAdminSupportConversationCard(conversation, selected) {
    const unread = Number(conversation.unreadByAdmin || 0);
    const lastMessage = conversation.messages?.at(-1);
    return createElement('button', {
      type: 'button',
      class: `admin-support-card ${selected ? 'selected' : ''}`,
      'data-support-select': conversation.id
    }, [
      createElement('span', { class: 'admin-support-avatar' }, this.getSupportInitials(conversation.customerName)),
      createElement('span', { class: 'admin-support-card-copy' }, [
        createElement('strong', {}, conversation.customerName),
        createElement('small', {}, [
          conversation.customerEmail ? createElement('span', {}, conversation.customerEmail) : null,
          conversation.robloxUsername ? createElement('span', {}, `@${conversation.robloxUsername}`) : null
        ]),
        createElement('em', {}, lastMessage?.body || 'Sem mensagens do cliente')
      ]),
      createElement('span', { class: 'admin-support-card-meta' }, [
        unread ? createElement('b', {}, String(unread)) : null,
        createElement('small', {}, this.formatSupportDate(conversation.updatedAt)),
        createElement('span', { class: 'status-pill' }, SUPPORT_STATUS_LABELS[conversation.status] || conversation.status)
      ]),
      createElement('span', { class: 'admin-support-open-label' }, 'Abrir conversa')
    ]);
  }

  buildAdminSupportDetail(conversation) {
    const closed = conversation.status === 'closed';
    return createElement('article', { class: 'admin-support-detail' }, [
      createElement('div', { class: 'admin-support-detail-top' }, [
        createElement('div', {}, [
          createElement('strong', {}, conversation.customerName),
          createElement('span', {}, [
            conversation.customerEmail || 'Email nao informado',
            conversation.robloxUsername ? ` · @${conversation.robloxUsername}` : ''
          ].join(''))
        ]),
        createElement('span', { class: 'status-pill' }, SUPPORT_STATUS_LABELS[conversation.status] || conversation.status)
      ]),
      createElement('div', { class: 'admin-chat-history' }, this.supportService.getConversationMessages(conversation.id).map((message) => this.buildAdminSupportMessage(message))),
      closed
        ? createElement('p', { class: 'support-closed-note' }, 'Conversa fechada.')
        : createElement('form', { class: 'admin-support-reply', 'data-support-action': 'reply' }, [
          createElement('textarea', {
            name: 'supportReply',
            maxlength: '1000',
            required: 'required',
            placeholder: 'Responder cliente...'
          }),
          createElement('button', { type: 'submit', class: 'button-primary' }, 'Enviar resposta')
        ]),
      createElement('div', { class: 'admin-support-actions' }, [
        createElement('button', {
          type: 'button',
          class: 'button-secondary',
          'data-support-action': 'resolve',
          disabled: closed ? 'disabled' : null
        }, 'Marcar resolvido'),
        createElement('button', {
          type: 'button',
          class: 'button-secondary',
          'data-support-action': 'close',
          disabled: closed ? 'disabled' : null
        }, 'Fechar conversa')
      ])
    ]);
  }

  buildAdminSupportMessage(message) {
    const sender = String(message.senderType || message.sender || '').toLowerCase();
    const isCustomer = ['customer', 'client', 'user'].includes(sender);
    const isBot = ['bot', 'assistant', 'system'].includes(sender);
    const senderClass = isCustomer ? 'customer' : isBot ? 'bot' : 'admin';
    const row = createElement('div', { class: `admin-chat-message-row ${senderClass}` });
    if (!isCustomer) {
      const avatar = createElement('span', { class: `admin-chat-avatar ${senderClass}` }, [
        createElement('span', { class: 'admin-chat-avatar-fallback', 'aria-hidden': 'true' }, isBot ? 'BOT' : 'ADM')
      ]);
      const image = createElement('img', {
        src: isBot ? SUPPORT_BOT_AVATAR : SUPPORT_ADMIN_AVATAR,
        alt: isBot ? 'Assistente virtual Delima Blox' : 'Atendente Delima Blox'
      });
      image.addEventListener('error', () => image.remove(), { once: true });
      avatar.append(image);
      row.append(avatar);
    }
    row.append(createElement('div', { class: `admin-chat-message ${senderClass}` }, [
      createElement('span', {}, isCustomer ? 'Cliente' : isBot ? 'Assistente Delima Blox' : 'Admin Delima Blox'),
      createElement('p', {}, message.body),
      createElement('small', {}, this.formatSupportDate(message.createdAt))
    ]));
    return row;
  }

  selectAdminSupportConversation(conversationId) {
    if (!conversationId) return;
    this.selectedSupportConversationId = conversationId;
    this.supportService.markAsRead(conversationId, 'admin');
    this.supportAdminMessage = '';
    this.render();
  }

  replyToSupportConversation(event) {
    event.preventDefault();
    const conversationId = this.selectedSupportConversationId || this.supportService.listAdminConversations()[0]?.id;
    if (!conversationId) return;
    const data = new FormData(event.currentTarget);
    try {
      this.supportService.replyAsAdmin(conversationId, data.get('supportReply'));
      this.supportService.markAsRead(conversationId, 'admin');
      this.supportAdminMessage = 'Resposta enviada para o cliente.';
    } catch (error) {
      this.supportAdminMessage = error.message || 'Nao foi possivel enviar a resposta.';
    }
    this.render();
  }

  resolveSupportConversation(conversationId) {
    if (!conversationId) return;
    this.supportService.markResolved(conversationId);
    this.supportAdminMessage = 'Conversa marcada como resolvida.';
    this.render();
  }

  closeSupportConversation(conversationId) {
    if (!conversationId) return;
    this.supportService.closeConversation(conversationId);
    this.supportAdminMessage = 'Conversa fechada.';
    this.render();
  }

  getSupportInitials(name) {
    return String(name || 'Cliente')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'CL';
  }

  formatSupportDate(value) {
    if (!value) return 'Agora';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Agora';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  async logoutAdmin() {
    await this.authService.logout();
    this.adminAccess.authorized = false;
    this.adminSession = null;
    this.onNavigate('home');
  }

  buildAdminOrderCard(order) {
    const orderItems = Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : [{
        productName: order.productName || order.seedName,
        quantity: order.quantity,
        unitPriceInCents: order.unitPriceInCents,
        subtotalInCents: order.subtotalInCents
      }];
    const card = createElement('article', { class: 'admin-order-card' }, [
      createElement('div', { class: 'admin-order-top' }, [
        createElement('strong', {}, order.orderCode),
        createElement('span', { class: 'status-pill' }, this.formatOrderStatus(order))
      ]),
      createElement('div', { class: 'admin-order-items' }, orderItems.map((item) => createElement('div', { class: 'admin-order-item-line' }, [
        createElement('strong', {}, item.productName || item.seedName),
        createElement('span', {}, `${item.quantity}x`),
        createElement('span', {}, formatMoney(item.unitPriceInCents, 'BRL')),
        createElement('span', {}, formatMoney(item.subtotalInCents, 'BRL'))
      ]))),
      createElement('div', { class: 'pix-order-grid' }, [
        this.buildPaymentLine('Produtos', String(orderItems.length)),
        this.buildPaymentLine('Quantidade total', String(orderItems.reduce((total, item) => total + Number(item.quantity || 0), 0))),
        this.buildPaymentLine('Cupom', order.couponCode || 'Sem cupom'),
        this.buildPaymentLine('Desconto', `-${formatMoney(order.discountInCents, 'BRL')}`),
        this.buildPaymentLine('Total', formatMoney(order.totalInCents, 'BRL')),
        this.buildPaymentLine('Cliente', order.customerName),
        this.buildPaymentLine('Roblox', `@${order.robloxUsername}`),
        order.storageMode === 'local' ? this.buildPaymentLine('Origem', 'Pedido manual') : null,
        this.buildPaymentLine('Pagamento informado', order.customerReportedPayment ? 'Sim' : 'Nao'),
        this.buildPaymentLine('Comprovante', order.receiptStatus || 'Nao enviado')
      ].filter(Boolean)),
      createElement('div', { class: 'admin-order-actions' }, [
        createElement('button', { type: 'button', class: 'button-secondary', 'data-admin-action': 'confirm-payment' }, 'Confirmar pagamento'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-admin-action': 'reject-receipt' }, 'Rejeitar comprovante'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-admin-action': 'start-delivery' }, 'Iniciar entrega'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-admin-action': 'delivered' }, 'Marcar como entregue'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-admin-action': 'cancel' }, 'Cancelar pedido')
      ])
    ]);

    card.querySelectorAll('[data-admin-action]').forEach((button) => {
      button.addEventListener('click', () => {
        this.applyAdminOrderAction(order.orderCode, button.getAttribute('data-admin-action'));
      });
    });
    return card;
  }

  async applyAdminOrderAction(orderCode, action) {
    const order = this.manualOrders.find((item) => item.orderCode === orderCode);
    if (!order) return;
    const patch = {};
    if (action === 'confirm-payment') {
      Object.assign(patch, { paymentStatus: 'confirmed', orderStatus: 'paid', adminNote: 'Pagamento confirmado manualmente.' });
    } else if (action === 'reject-receipt') {
      Object.assign(patch, { receiptStatus: 'Rejeitado - aguardando novo comprovante.', paymentStatus: 'pending', orderStatus: 'awaiting_payment' });
    } else if (action === 'start-delivery') {
      Object.assign(patch, { orderStatus: 'preparing_delivery', deliveryStatus: 'delivering' });
    } else if (action === 'delivered') {
      Object.assign(patch, { orderStatus: 'delivered', deliveryStatus: 'delivered' });
    } else if (action === 'cancel') {
      Object.assign(patch, { orderStatus: 'cancelled', paymentStatus: order.paymentStatus === 'confirmed' ? 'confirmed' : 'cancelled' });
    }
    if (this.isLocalOrderStorageMode()) {
      if (!this.adminAccess.authorized) {
        this.openAdminAccessModal();
        return;
      }
      const updated = this.localOrderRepository.update(orderCode, patch);
      if (updated) Object.assign(order, updated);
      this.render();
      return;
    }
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderCode)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      this.adminAccess.authorized = false;
      this.openAdminAccessModal();
      return;
    }
    if (response.ok && result.order) {
      Object.assign(order, result.order);
    }
    this.render();
  }

  formatOrderStatus(order) {
    if (order.orderStatus === 'delivered') return 'Entregue';
    if (order.orderStatus === 'preparing_delivery') return 'Entrega em andamento';
    if (order.orderStatus === 'paid') return 'Pagamento confirmado';
    if (order.orderStatus === 'cancelled') return 'Cancelado';
    if (order.customerReportedPayment) return 'Cliente informou pagamento - aguardando confirmacao';
    return 'Aguardando pagamento';
  }

  formatPrice(seed) {
    if (Number.isFinite(seed.purchasePrice)) {
      return `${seed.purchasePrice} ${seed.currency || 'Sheckles'}`;
    }
    if (Number.isFinite(seed.priceMin) && Number.isFinite(seed.priceMax)) {
      return `${seed.priceMin} - ${seed.priceMax} ${seed.currency || 'Sheckles'}`;
    }
    return 'Preco em revisao';
  }

  formatAvailability(seed) {
    if (typeof seed.obtainable === 'boolean') {
      return seed.obtainable ? 'Disponivel' : 'Indisponivel';
    }
    return 'Disponibilidade em revisao';
  }

  formatSaleStatus(seed) {
    if (!seed.commerce?.saleEnabled || !Number.isInteger(seed.commerce?.priceInCents)) {
      return 'Venda indisponivel';
    }
    if (!seed.commerce.availableStock) return 'Sem estoque';
    return `${formatMoney(seed.commerce.priceInCents, seed.commerce.currency)} para venda`;
  }

  isSeedImageConfirmed(seed) {
    return ['allowed', 'confirmed', 'real'].includes(String(seed.imageStatus || '').toLowerCase());
  }

  buildEmptyState(title, text) {
    const empty = createElement('div', { class: 'garden-empty panel' }, [
      createElement('span', { class: 'category-icon', 'aria-hidden': 'true' }, ''),
      createElement('h2', {}, title),
      createElement('p', {}, text),
      createElement('button', { type: 'button', class: 'button-secondary', 'data-empty-action': 'store' }, 'Ir para loja')
    ]);
    empty.querySelector('[data-empty-action="store"]').addEventListener('click', () => {
      this.activeTab = 'sementes';
      this.render();
    });
    return empty;
  }
}
