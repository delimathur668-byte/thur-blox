import { AuthService } from '../services/AuthService.js';
import { ReviewService } from '../services/ReviewService.js';
import { LocalOrderRepository } from '../services/grow-garden-2/LocalOrderRepository.js';
import { formatMoney } from '../services/grow-garden-2/StoreCommerceService.js';
import { SupportChatWidget } from './SupportChatWidget.js';
import { createElement } from './ui-utils.js';

const PORTAL_CARD_IMAGES = {
  'blox-fruits': '/assets/blox-fruits/blox-fruits-category-authorized.webp',
  'grow-garden': '/assets/portal/grow-a-garden-2.webp'
};
const APP_LOGO = '/assets/brand/delima-blox-logo.webp';
const STORE_PRODUCTS_URL = 'src/data/grow-garden-2/store-products.json';

const ORDER_FILTERS = [
  ['all', 'Todos'],
  ['pending', 'Pendentes'],
  ['approved', 'Aprovados'],
  ['delivered', 'Entregues'],
  ['cancelled', 'Cancelados']
];

const PAYMENT_STATUS_LABELS = {
  confirmed: 'Pagamento aprovado!',
  paid: 'Pagamento aprovado!',
  approved: 'Pagamento aprovado!',
  pending: 'Pagamento pendente',
  awaiting_payment: 'Pagamento pendente',
  amount_mismatch: 'Pagamento em análise',
  expired: 'Pagamento expirado',
  cancelled: 'Pedido cancelado',
  canceled: 'Pedido cancelado',
  failed: 'Pagamento recusado',
  refunded: 'Pagamento reembolsado'
};

const DELIVERY_STATUS_LABELS = {
  pending: 'Aguardando pagamento',
  awaiting_payment: 'Aguardando pagamento',
  paid: 'Pagamento aprovado',
  preparing_delivery: 'Em preparação',
  delivering: 'Em entrega',
  delivered: 'Pedido entregue',
  cancelled: 'Pedido cancelado',
  canceled: 'Pedido cancelado',
  refunded: 'Pedido reembolsado'
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const PORTAL_ICON_PATHS = {
  package: [
    ['path', { d: 'm21 8-9-5-9 5 9 5 9-5Z' }],
    ['path', { d: 'M3 8v8l9 5 9-5V8' }],
    ['path', { d: 'M12 13v8' }]
  ],
  dashboard: [
    ['rect', { x: '3', y: '3', width: '7', height: '8', rx: '1.5' }],
    ['rect', { x: '14', y: '3', width: '7', height: '5', rx: '1.5' }],
    ['rect', { x: '14', y: '12', width: '7', height: '9', rx: '1.5' }],
    ['rect', { x: '3', y: '15', width: '7', height: '6', rx: '1.5' }]
  ],
  logout: [
    ['path', { d: 'M10 17l5-5-5-5' }],
    ['path', { d: 'M15 12H3' }],
    ['path', { d: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4' }]
  ],
  cart: [
    ['circle', { cx: '9', cy: '20', r: '1.4' }],
    ['circle', { cx: '18', cy: '20', r: '1.4' }],
    ['path', { d: 'M2 3h3l2.2 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 7H6' }]
  ],
  user: [
    ['circle', { cx: '12', cy: '8', r: '4' }],
    ['path', { d: 'M5 21a7 7 0 0 1 14 0' }]
  ],
  chevronDown: [
    ['path', { d: 'm6 9 6 6 6-6' }]
  ],
  chevronUp: [
    ['path', { d: 'm18 15-6-6-6 6' }]
  ],
  home: [
    ['path', { d: 'm3 11 9-8 9 8' }],
    ['path', { d: 'M5 10v10h5v-6h4v6h5V10' }]
  ]
};

const buildPortalIcon = (name, className = 'portal-inline-icon') => {
  const wrapper = createElement('span', { class: className, 'aria-hidden': 'true' });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  (PORTAL_ICON_PATHS[name] || []).forEach(([tag, attrs]) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    svg.append(node);
  });
  wrapper.append(svg);
  return wrapper;
};

const GAME_CARDS = [
  {
    slug: 'blox-fruits',
    title: 'BLOX FRUITS',
    subtitle: 'Frutas, contas, gamepasses, serviços e pacotes para sua jornada.',
    image: PORTAL_CARD_IMAGES['blox-fruits'],
    alt: 'Arte original da categoria Blox Fruits',
    tags: ['Frutas', 'Kitsune', 'Dragon', 'Leopard', 'Dough', 'Contas', 'Gamepasses', 'Serviços', 'Pacotes'],
    action: 'Ver produtos',
    icon: 'BF',
    tone: 'blox-fruits'
  },
  {
    slug: 'grow-garden',
    title: 'GROW A GARDEN 2',
    subtitle: 'Veja seeds, pets, gears e pacotes disponíveis nesta categoria.',
    image: PORTAL_CARD_IMAGES['grow-garden'],
    alt: 'Capa do jogo Grow a Garden 2',
    tags: ['Seeds', 'Pets', 'Gears', 'Pacotes', 'Firefly', 'Sun Bloom', 'Star Fruit'],
    action: 'Ver produtos',
    icon: 'GG',
    tone: 'garden'
  }
];

const BENEFITS = [
  {
    icon: 'send',
    title: 'Envio rápido',
    text: 'Receba seu pedido após a confirmação do pagamento.'
  },
  {
    icon: 'headphones',
    title: 'Suporte eficiente',
    text: 'Fale com nosso suporte pelo chat do próprio site.'
  },
  {
    icon: 'shield',
    title: 'Compra segura',
    text: 'Nunca pedimos senha, cookie ou código de autenticação.'
  }
];

const FAQ_ITEMS = [
  ['Como faço uma compra?', 'Escolha o produto, adicione ao carrinho e finalize o pagamento via Pix.'],
  ['Quanto tempo demora a entrega?', 'A entrega acontece após a confirmação do pagamento, conforme disponibilidade do suporte.'],
  ['Preciso informar minha senha?', 'Não. Nunca pedimos senha, cookie ou código de autenticação.'],
  ['Como acompanho meu pedido?', 'Entre na sua conta e acesse Meus pedidos.'],
  ['Como falo com o suporte?', 'Use o chat no canto da tela.']
];

const CUSTOMER_REVIEWS = [
  {
    initials: 'LR',
    name: 'Cliente verificado',
    date: 'Avaliação verificada',
    text: 'Comprei e fui atendido rápido, site bem fácil de usar.',
    product: '20x HYPNO BLOOM SEED',
    productImage: '/assets/grow-a-garden-2/store/seeds/hypno-bloom-seed.webp'
  },
  {
    initials: 'EF',
    name: 'Cliente verificado',
    date: 'Avaliação verificada',
    text: 'Suporte respondeu certinho e consegui acompanhar meu pedido.',
    product: '6x GHOST PEPPER SEED',
    productImage: '/assets/grow-a-garden-2/store/seeds/ghost-pepper-seed.webp'
  },
  {
    initials: 'MV',
    name: 'Cliente verificado',
    date: 'Avaliação verificada',
    text: 'Checkout Pix simples e rápido.',
    product: '5x MOON BLOOM SEED',
    productSlug: '5x-moon-bloom-seed',
    productCategory: 'packages',
    productImage: '/assets/grow-a-garden-2/store/packages/5x-moon-bloom-seed.webp'
  },
  {
    initials: 'LR',
    name: 'Cliente verificado',
    date: 'Avaliação verificada',
    text: 'Pedido organizado e atendimento claro do começo ao fim.',
    product: '10x SUPER SPRINKLER',
    productImage: '/assets/grow-a-garden-2/store/gears/super-sprinkler.webp'
  },
  {
    initials: 'EF',
    name: 'Enzo Honorio Coelho Ferreira',
    date: '19 de julho de 2026',
    text: 'Preço bom e suporte rápido.',
    product: '5x DRAGON BREATH SEED',
    productImage: '/assets/grow-a-garden-2/store/packages/5x-dragon-breath-seed.webp'
  },
  {
    initials: 'MV',
    name: 'Cliente verificado',
    date: 'Avaliação verificada',
    text: 'Compra simples e suporte disponível quando precisei.',
    product: 'SUPER WATERING CAN',
    productImage: '/assets/grow-a-garden-2/store/gears/super-watering-can.webp'
  }
];

export class HomePortal {
  constructor({
    root,
    onSelect,
    authService = new AuthService(),
    initialLoginOpen = false,
    initialLoginRedirect = null,
    initialAccessDenied = false
  }) {
    this.root = root;
    this.onSelect = onSelect;
    this.authService = authService;
    this.session = this.authService.getSession();
    this.currentUser = this.authService.getCurrentUser();
    this.localOrderRepository = new LocalOrderRepository();
    this.reviewService = new ReviewService();
    this.loginOpen = initialLoginOpen;
    this.loginRedirect = initialLoginRedirect;
    this.profileOpen = false;
    this.userMenuOpen = false;
    this.accountOpen = false;
    this.accountTab = initialAccessDenied ? 'denied' : 'profile';
    this.accountOrders = [];
    this.accountOrdersLoaded = false;
    this.accountOrdersLoading = false;
    this.accountOrdersError = '';
    this.accountOrderFilter = 'all';
    this.accountOrderSearch = '';
    this.selectedOrderCode = '';
    this.thankYouOrderCode = '';
    this.reviewMessage = '';
    this.reviewError = '';
    this.paymentResumeMessage = '';
    this.paymentResumeStatus = '';
    this.productCatalog = [];
    this.productCatalogLoaded = false;
    this.loginMode = 'login';
    this.loginState = {
      email: '',
      password: '',
      loading: false,
      message: '',
      error: ''
    };
    this.registerState = {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      robloxUsername: '',
      loading: false,
      error: '',
      message: ''
    };
    this.searchTerm = '';
    this.render();
  }

  render() {
    this.root.innerHTML = '';
    const profileOrders = this.profileOpen ? this.getCustomerOrders() : [];
    this.openNewPaidOrderThankYou(profileOrders);
    const selectedOrder = this.getSelectedCustomerOrder(profileOrders);
    const thankYouOrder = this.getThankYouOrder();
    const mainContent = this.profileOpen
      ? [this.buildProfilePage(profileOrders)]
      : [
        this.buildHero(),
        this.buildGamesSection(),
        this.buildBenefitsSection(),
        this.buildReviewsSection(),
        this.buildFaqSection(),
        this.buildFooter()
      ];
    const container = createElement('div', { class: 'home-portal' }, [
      this.buildTopbar(),
      ...mainContent,
      this.loginOpen ? this.buildLoginModal() : null,
      this.accountTab === 'denied' ? this.buildAccountModal() : null,
      selectedOrder ? this.buildOrderDetailsModal(selectedOrder) : null,
      thankYouOrder ? this.buildThankYouModal(thankYouOrder) : null,
      new SupportChatWidget().render()
    ]);
    this.root.append(container);
  }

  buildTopbar() {
    const header = createElement('header', { class: 'portal-topbar home-topbar' }, [
      createElement('div', { class: 'portal-brand' }, [
        createElement('div', { class: 'portal-icon trade-hub-logo', 'aria-hidden': 'true' }, [
          createElement('img', { src: APP_LOGO, alt: '', class: 'app-logo-image' })
        ]),
        createElement('div', { class: 'portal-brand-copy' }, [
          createElement('strong', {}, 'THUR BLOX'),
          createElement('small', {}, 'Loja digital Roblox')
        ])
      ]),
      createElement('label', { class: 'portal-search', 'aria-label': 'Buscar produto' }, [
        createElement('span', { class: 'portal-search-icon', 'aria-hidden': 'true' }, ''),
        createElement('input', {
          type: 'search',
          placeholder: 'Buscar produto',
          value: this.searchTerm,
          autocomplete: 'off'
        })
      ]),
      createElement('div', { class: 'portal-actions' }, [
        this.session
          ? this.buildUserMenu()
          : createElement('button', { type: 'button', class: 'button-secondary header-action-button login-button', 'data-action': 'open-login' }, [
            buildPortalIcon('user', 'portal-inline-icon login-user-icon'),
            createElement('span', {}, 'Entrar')
          ]),
        createElement('button', { type: 'button', class: 'button-secondary header-action-button cart-button', 'data-action': 'cart', 'aria-label': 'Abrir carrinho' }, [
          buildPortalIcon('cart', 'portal-inline-icon cart-button-icon'),
          createElement('span', {}, 'Carrinho')
        ])
      ])
    ]);

    header.querySelector('.portal-search input').addEventListener('input', (event) => {
      this.searchTerm = event.target.value;
      this.applyCategoryFilter();
    });
    header.querySelector('[data-action="cart"]').addEventListener('click', () => this.onSelect('grow-garden'));
    header.querySelector('[data-action="open-login"]')?.addEventListener('click', () => this.openLoginModal());
    header.querySelector('[data-action="toggle-user-menu"]')?.addEventListener('click', () => {
      this.userMenuOpen = !this.userMenuOpen;
      this.render();
    });
    header.querySelector('[data-action="open-admin"]')?.addEventListener('click', () => this.openAdminFromMenu());
    header.querySelector('[data-action="open-profile-orders"]')?.addEventListener('click', () => this.openProfilePage('orders'));
    header.querySelector('[data-action="logout-admin"]')?.addEventListener('click', async () => this.logoutAdmin());
    header.addEventListener('click', (event) => {
      if (!event.target.closest('.portal-user-menu')) this.userMenuOpen = false;
    });
    return header;
  }

  buildUserMenu() {
    const user = this.currentUser || {};
    const displayName = user.name || this.session?.name || 'Cliente';
    const email = user.email || this.session?.email || '';
    const isAdmin = this.authService.isAdminSession(this.session);
    return createElement('div', { class: `portal-user-menu ${this.userMenuOpen ? 'open' : ''}` }, [
      createElement('button', { type: 'button', class: 'portal-user-trigger', 'data-action': 'toggle-user-menu', 'aria-expanded': this.userMenuOpen ? 'true' : 'false' }, [
        createElement('span', { class: 'portal-user-avatar', 'aria-hidden': 'true' }, this.getCustomerInitials(displayName)),
        createElement('span', { class: 'portal-user-copy' }, [
          createElement('strong', {}, displayName),
          createElement('small', {}, 'Meu perfil')
        ]),
        buildPortalIcon(this.userMenuOpen ? 'chevronUp' : 'chevronDown', 'portal-inline-icon portal-user-chevron')
      ]),
      this.userMenuOpen ? createElement('div', { class: 'portal-user-dropdown' }, [
        createElement('div', { class: 'portal-user-dropdown-head' }, [
          createElement('span', { class: 'portal-user-avatar large', 'aria-hidden': 'true' }, this.getCustomerInitials(displayName)),
          createElement('span', {}, [
            createElement('strong', {}, displayName),
            createElement('small', {}, email)
          ])
        ]),
        this.buildProfileMenuItem({ icon: 'package', label: 'Meus pedidos', action: 'open-profile-orders' }),
        isAdmin ? this.buildProfileMenuItem({ icon: 'dashboard', label: 'Painel', action: 'open-admin' }) : null,
        this.buildProfileMenuItem({ icon: 'logout', label: 'Sair da conta', action: 'logout-admin', danger: true })
      ]) : null
    ]);
  }

  buildProfileMenuItem({ icon, label, action, danger = false }) {
    return createElement('button', {
      type: 'button',
      class: `portal-user-dropdown-item ${danger ? 'danger' : ''}`,
      'data-action': action
    }, [
      buildPortalIcon(icon, 'portal-inline-icon portal-menu-icon'),
      createElement('strong', {}, label)
    ]);
  }

  buildLoginModal() {
    const overlay = createElement('div', { class: 'access-modal-overlay auth-login-overlay' }, [
      createElement('form', { class: 'access-modal panel auth-login-modal' }, [
        createElement('h2', {}, this.loginMode === 'register' ? 'Criar conta' : 'Entrar na sua conta'),
        createElement('p', {}, 'Acesse sua conta para acompanhar pedidos e falar com o suporte.'),
        createElement('div', { class: 'auth-mode-tabs' }, [
          createElement('button', { type: 'button', class: `tab-button ${this.loginMode === 'login' ? 'active' : ''}`, 'data-auth-mode': 'login' }, 'Entrar'),
          createElement('button', { type: 'button', class: `tab-button ${this.loginMode === 'register' ? 'active' : ''}`, 'data-auth-mode': 'register' }, 'Criar conta')
        ]),
        this.loginMode === 'register' ? this.buildRegisterFields() : this.buildLoginFields(),
        createElement('p', { class: 'auth-security-note' }, 'Nunca informe sua senha, cookie ou código de autenticação do Roblox.'),
        this.loginMode === 'register' && this.registerState.error ? createElement('p', { class: 'checkout-message error' }, this.registerState.error) : null,
        this.loginMode === 'register' && this.registerState.message ? createElement('p', { class: 'checkout-message success' }, this.registerState.message) : null,
        this.loginMode === 'login' && this.loginState.error ? createElement('p', { class: 'checkout-message error' }, this.loginState.error) : null,
        this.loginMode === 'login' && this.loginState.message ? createElement('p', { class: 'checkout-message success' }, this.loginState.message) : null,
        createElement('button', {
          type: 'submit',
          class: 'button-primary',
          disabled: this.loginState.loading || this.registerState.loading ? 'disabled' : null
        }, this.loginMode === 'register'
          ? (this.registerState.loading ? 'Criando...' : 'Criar conta')
          : (this.loginState.loading ? 'Entrando...' : 'Entrar')),
        createElement('button', { type: 'button', class: 'auth-link-button', 'data-auth-mode': this.loginMode === 'register' ? 'login' : 'register' }, this.loginMode === 'register' ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar conta'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'cancel-login' }, 'Cancelar')
      ])
    ]);

    overlay.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.loginMode === 'register') this.submitRegister();
      else this.submitLogin();
    });
    overlay.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        this.loginMode = button.getAttribute('data-auth-mode');
        this.loginState.error = '';
        this.registerState.error = '';
        this.render();
      });
    });
    overlay.querySelector('[data-login-email]')?.addEventListener('input', (event) => {
      this.loginState.email = event.target.value;
    });
    overlay.querySelector('[data-login-password]')?.addEventListener('input', (event) => {
      this.loginState.password = event.target.value;
    });
    overlay.querySelector('[data-register-name]')?.addEventListener('input', (event) => {
      this.registerState.name = event.target.value;
    });
    overlay.querySelector('[data-register-email]')?.addEventListener('input', (event) => {
      this.registerState.email = event.target.value;
    });
    overlay.querySelector('[data-register-password]')?.addEventListener('input', (event) => {
      this.registerState.password = event.target.value;
    });
    overlay.querySelector('[data-register-confirm]')?.addEventListener('input', (event) => {
      this.registerState.confirmPassword = event.target.value;
    });
    overlay.querySelector('[data-register-roblox]')?.addEventListener('input', (event) => {
      this.registerState.robloxUsername = event.target.value;
    });
    overlay.querySelector('[data-action="cancel-login"]').addEventListener('click', () => this.closeLoginModal());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.closeLoginModal();
    });
    window.setTimeout(() => overlay.querySelector('[data-login-email], [data-register-name]')?.focus(), 0);
    return overlay;
  }

  buildLoginFields() {
    return createElement('div', { class: 'auth-form-fields' }, [
      createElement('label', { class: 'checkout-field' }, [
        createElement('span', {}, 'E-mail'),
        createElement('input', {
          type: 'email',
          value: this.loginState.email,
          autocomplete: 'email',
          required: 'required',
          'data-login-email': 'true'
        })
      ]),
      createElement('label', { class: 'checkout-field' }, [
        createElement('span', {}, 'Senha'),
        createElement('input', {
          type: 'password',
          value: this.loginState.password,
          autocomplete: 'current-password',
          required: 'required',
          'data-login-password': 'true'
        })
      ])
    ]);
  }

  buildRegisterFields() {
    return createElement('div', { class: 'auth-form-fields' }, [
      createElement('label', { class: 'checkout-field' }, [
        createElement('span', {}, 'Nome'),
        createElement('input', { type: 'text', value: this.registerState.name, required: 'required', autocomplete: 'name', 'data-register-name': 'true' })
      ]),
      createElement('label', { class: 'checkout-field' }, [
        createElement('span', {}, 'E-mail'),
        createElement('input', { type: 'email', value: this.registerState.email, required: 'required', autocomplete: 'email', 'data-register-email': 'true' })
      ]),
      createElement('label', { class: 'checkout-field' }, [
        createElement('span', {}, 'Senha'),
        createElement('input', { type: 'password', value: this.registerState.password, required: 'required', autocomplete: 'new-password', 'data-register-password': 'true' })
      ]),
      createElement('label', { class: 'checkout-field' }, [
        createElement('span', {}, 'Confirmar senha'),
        createElement('input', { type: 'password', value: this.registerState.confirmPassword, required: 'required', autocomplete: 'new-password', 'data-register-confirm': 'true' })
      ]),
      createElement('label', { class: 'checkout-field' }, [
        createElement('span', {}, 'Nick do Roblox (opcional)'),
        createElement('input', { type: 'text', value: this.registerState.robloxUsername, autocomplete: 'username', 'data-register-roblox': 'true' })
      ])
    ]);
  }

  openLoginModal() {
    this.loginOpen = true;
    this.loginMode = 'login';
    this.loginState.error = '';
    this.render();
  }

  closeLoginModal() {
    this.loginOpen = false;
    this.loginState.password = '';
    this.loginState.loading = false;
    this.loginState.error = '';
    this.render();
  }

  async submitLogin() {
    this.loginState.loading = true;
    this.loginState.error = '';
    this.render();
    let navigated = false;
    try {
      this.session = await this.authService.login({
        email: this.loginState.email,
        password: this.loginState.password
      });
      this.currentUser = this.authService.getCurrentUser();
      this.loginOpen = false;
      this.loginState.password = '';
      if (this.loginRedirect === 'admin') {
        navigated = true;
        await this.onSelect('admin');
      }
    } catch (error) {
      this.loginState.error = error.message || 'Não foi possível entrar.';
    } finally {
      this.loginState.loading = false;
      if (!navigated) this.render();
    }
  }

  submitRegister() {
    this.registerState.loading = true;
    this.registerState.error = '';
    this.registerState.message = '';
    this.render();
    try {
      const result = this.authService.register({
        name: this.registerState.name,
        email: this.registerState.email,
        password: this.registerState.password,
        confirmPassword: this.registerState.confirmPassword,
        robloxUsername: this.registerState.robloxUsername
      });
      this.session = result.session;
      this.currentUser = result.user;
      this.loginOpen = false;
      this.registerState.password = '';
      this.registerState.confirmPassword = '';
      this.loginState.message = 'Conta criada com sucesso.';
    } catch (error) {
      this.registerState.error = error.message || 'Não foi possível criar a conta.';
    } finally {
      this.registerState.loading = false;
      this.render();
    }
  }

  async logoutAdmin() {
    await this.authService.logout();
    this.session = null;
    this.currentUser = null;
    this.accountOpen = false;
    this.accountTab = 'profile';
    this.profileOpen = false;
    this.userMenuOpen = false;
    this.selectedOrderCode = '';
    this.onSelect('home');
  }

  openAccountModal(tab = 'profile') {
    this.openProfilePage(tab === 'profile' ? 'orders' : tab);
  }

  openProfilePage(tab = 'orders') {
    this.profileOpen = true;
    this.userMenuOpen = false;
    this.accountOpen = false;
    this.accountTab = tab;
    if (tab === 'orders' || !this.accountOrdersLoaded) {
      this.refreshCustomerOrders();
    }
    this.render();
  }

  openAdminFromMenu() {
    this.userMenuOpen = false;
    this.onSelect('admin');
  }

  closeAccountModal() {
    this.accountOpen = false;
    this.accountTab = 'profile';
    this.render();
  }

  buildProfilePage(orders) {
    const user = this.currentUser || {};
    const displayName = user.name || this.session?.name || 'Cliente';
    const email = user.email || this.session?.email || '';
    const filteredOrders = this.filterCustomerOrders(orders);
    const page = createElement('main', { class: 'customer-profile-page' }, [
      createElement('aside', { class: 'customer-profile-sidebar' }, [
        createElement('div', { class: 'customer-profile-hero' }, [
          createElement('span', { class: 'customer-profile-avatar', 'aria-hidden': 'true' }, this.getCustomerInitials(displayName)),
          createElement('h2', {}, 'Meu perfil'),
          createElement('p', {}, 'Área do cliente')
        ]),
        createElement('nav', { class: 'customer-profile-nav' }, [
          createElement('button', { type: 'button', class: 'active', 'data-action': 'profile-orders' }, [
            buildPortalIcon('package', 'portal-inline-icon profile-nav-icon'),
            createElement('span', {}, 'Minhas compras')
          ]),
          createElement('button', { type: 'button', 'data-action': 'account-store' }, [
            buildPortalIcon('home', 'portal-inline-icon profile-nav-icon'),
            createElement('span', {}, 'Voltar para a loja')
          ])
        ])
      ]),
      createElement('section', { class: 'customer-orders-main' }, [
        createElement('div', { class: 'customer-orders-breadcrumb' }, [
          createElement('button', { type: 'button', 'data-action': 'account-home' }, 'Início'),
          createElement('span', {}, '>'),
          createElement('strong', {}, 'Meus pedidos')
        ]),
        createElement('h1', {}, 'Meus pedidos'),
        this.accountOrdersLoading ? createElement('p', { class: 'checkout-message' }, 'Carregando suas compras...') : null,
        this.accountOrdersError ? createElement('p', { class: 'checkout-message error' }, this.accountOrdersError) : null,
        filteredOrders.length === 0 ? this.buildEmptyOrdersState(orders.length === 0) : null,
        filteredOrders.length > 0
          ? createElement('div', { class: 'customer-orders-list' }, filteredOrders.map((order) => this.buildCustomerOrderCard(order)))
          : null
      ])
    ]);

    page.querySelector('[data-action="account-home"]').addEventListener('click', () => {
      this.profileOpen = false;
      this.selectedOrderCode = '';
      this.render();
    });
    page.querySelector('[data-action="account-store"]').addEventListener('click', () => {
      this.profileOpen = false;
      this.selectedOrderCode = '';
      this.onSelect('grow-garden');
    });
    page.querySelectorAll('[data-order-details]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedOrderCode = button.getAttribute('data-order-details') || '';
        this.paymentResumeMessage = '';
        this.paymentResumeStatus = '';
        this.render();
      });
    });
    page.querySelectorAll('[data-order-thank-you]').forEach((button) => {
      button.addEventListener('click', () => this.openThankYou(button.getAttribute('data-order-thank-you')));
    });
    page.querySelectorAll('[data-continue-payment]').forEach((button) => {
      button.addEventListener('click', () => this.continueCustomerPayment(button.getAttribute('data-continue-payment')));
    });
    return page;
  }

  buildAccountModal() {
    const isDenied = this.accountTab === 'denied';
    const orders = this.getCustomerOrders();
    const selectedOrder = this.getSelectedCustomerOrder(orders);
    const overlay = createElement('div', { class: 'access-modal-overlay account-modal-overlay' }, [
      createElement('section', { class: 'access-modal panel account-modal' }, [
        createElement('div', { class: 'account-modal-top' }, [
          createElement('div', {}, [
            createElement('h2', {}, isDenied ? 'Acesso não autorizado' : 'Minha conta'),
            createElement('p', {}, isDenied ? 'Esta conta não possui permissão para acessar o painel.' : 'Acompanhe seu perfil, pedidos e suporte.')
          ]),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'close-account' }, 'Fechar')
        ]),
        isDenied ? null : createElement('nav', { class: 'account-tabs' }, [
          createElement('button', { type: 'button', class: `tab-button ${this.accountTab === 'profile' ? 'active' : ''}`, 'data-account-tab': 'profile' }, 'Meu perfil'),
          createElement('button', { type: 'button', class: `tab-button ${this.accountTab === 'orders' ? 'active' : ''}`, 'data-account-tab': 'orders' }, 'Meus pedidos'),
          createElement('button', { type: 'button', class: `tab-button ${this.accountTab === 'support' ? 'active' : ''}`, 'data-account-tab': 'support' }, 'Suporte')
        ]),
        isDenied ? createElement('p', { class: 'checkout-message error' }, 'Esta conta não possui permissão para acessar o painel.') : this.buildAccountContent(orders),
        createElement('div', { class: 'checkout-actions' }, [
          this.authService.isAdminSession(this.session)
            ? createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'account-admin' }, 'Painel')
            : null,
          this.session ? createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'account-logout' }, 'Sair') : null
        ])
      ])
    ]);
    overlay.querySelector('[data-action="close-account"]').addEventListener('click', () => this.closeAccountModal());
    overlay.querySelector('[data-action="account-admin"]')?.addEventListener('click', () => this.onSelect('admin'));
    overlay.querySelectorAll('[data-action="account-logout"]').forEach((button) => {
      button.addEventListener('click', () => this.logoutAdmin());
    });
    overlay.querySelectorAll('[data-account-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.accountTab = button.getAttribute('data-account-tab');
        if (this.accountTab === 'orders') this.refreshCustomerOrders();
        this.render();
      });
    });
    overlay.querySelector('[data-action="account-orders"]')?.addEventListener('click', () => {
      this.accountTab = 'orders';
      this.refreshCustomerOrders();
      this.render();
    });
    overlay.querySelector('[data-action="account-store"]')?.addEventListener('click', () => {
      this.closeAccountModal();
      this.onSelect('grow-garden');
    });
    overlay.querySelector('[data-order-search]')?.addEventListener('input', (event) => {
      this.accountOrderSearch = event.target.value;
      this.render();
    });
    overlay.querySelectorAll('[data-order-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        this.accountOrderFilter = button.getAttribute('data-order-filter') || 'all';
        this.render();
      });
    });
    overlay.querySelectorAll('[data-order-details]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedOrderCode = button.getAttribute('data-order-details') || '';
        this.paymentResumeMessage = '';
        this.paymentResumeStatus = '';
        this.render();
      });
    });
    overlay.querySelectorAll('[data-order-thank-you]').forEach((button) => {
      button.addEventListener('click', () => this.openThankYou(button.getAttribute('data-order-thank-you')));
    });
    overlay.querySelectorAll('[data-continue-payment]').forEach((button) => {
      button.addEventListener('click', () => this.continueCustomerPayment(button.getAttribute('data-continue-payment')));
    });
    overlay.querySelector('[data-copy-pix]')?.addEventListener('click', () => this.copyOrderPix(selectedOrder));
    overlay.querySelector('[data-action="open-support-widget"]')?.addEventListener('click', () => {
      this.closeAccountModal();
      window.dispatchEvent(new CustomEvent('thur-blox-open-support'));
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.closeAccountModal();
    });
    return overlay;
  }

  buildAccountContent(orders) {
    if (this.accountTab === 'orders') {
      const filteredOrders = this.filterCustomerOrders(orders);
      const selectedOrder = this.getSelectedCustomerOrder(orders);
      return createElement('div', { class: 'account-orders-panel' }, [
        createElement('div', { class: 'account-orders-toolbar' }, [
          createElement('div', { class: 'account-order-filters' }, ORDER_FILTERS.map(([id, label]) => createElement('button', {
            type: 'button',
            class: `tab-button ${this.accountOrderFilter === id ? 'active' : ''}`,
            'data-order-filter': id
          }, label))),
          createElement('label', { class: 'account-order-search' }, [
            createElement('span', {}, 'Buscar pedido'),
            createElement('input', {
              type: 'search',
              value: this.accountOrderSearch,
              placeholder: 'THUR-XXXXXX',
              'data-order-search': 'true'
            })
          ])
        ]),
        this.accountOrdersLoading ? createElement('p', { class: 'checkout-message' }, 'Carregando suas compras...') : null,
        this.accountOrdersError ? createElement('p', { class: 'checkout-message error' }, this.accountOrdersError) : null,
        filteredOrders.length === 0 ? this.buildEmptyOrdersState(orders.length === 0) : null,
        filteredOrders.length > 0
          ? createElement('div', { class: 'account-orders-list' }, filteredOrders.map((order) => this.buildCustomerOrderCard(order)))
          : null,
        selectedOrder ? this.buildCustomerOrderDetails(selectedOrder) : null
      ]);
    }
    if (this.accountTab === 'support') {
      return createElement('div', { class: 'account-support-panel' }, [
        createElement('p', {}, 'Fale com o suporte pelo chat da loja. Suas mensagens ficam vinculadas ao atendimento aberto neste navegador.'),
        createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'open-support-widget' }, 'Abrir suporte')
      ]);
    }
    const user = this.currentUser || {};
    const initials = this.getCustomerInitials(user.name || this.session?.email || 'Cliente');
    return createElement('div', { class: 'account-profile-card' }, [
      createElement('div', { class: 'account-profile-header' }, [
        createElement('span', { class: 'account-avatar', 'aria-hidden': 'true' }, initials),
        createElement('div', {}, [
          createElement('strong', {}, user.name || 'Cliente'),
          createElement('small', {}, user.email || this.session?.email || '')
        ])
      ]),
      createElement('div', { class: 'account-profile-grid' }, [
        this.buildAccountLine('Nome', user.name || 'Cliente'),
        this.buildAccountLine('E-mail', user.email || this.session?.email || ''),
        this.buildAccountLine('Roblox', user.robloxUsername ? `@${user.robloxUsername}` : 'Não informado')
      ]),
      createElement('div', { class: 'account-profile-actions' }, [
        createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'account-orders' }, 'Minhas compras'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'account-store' }, 'Voltar para a loja'),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'account-logout' }, 'Sair')
      ])
    ]);
  }

  buildAccountLine(label, value) {
    return createElement('span', { class: 'account-profile-line' }, [
      createElement('small', {}, label),
      createElement('strong', {}, value)
    ]);
  }

  buildCustomerOrderCard(order) {
    const status = this.getOrderVisualStatus(order);
    const quantity = this.getOrderItemQuantity(order);
    return createElement('article', { class: 'account-order-card' }, [
      createElement('div', { class: 'account-order-left' }, [
        createElement('div', { class: 'account-order-main' }, [
          createElement('span', { class: `account-status-line ${status.tone}` }, [
            createElement('i', { class: 'account-status-dot', 'aria-hidden': 'true' }, ''),
            createElement('strong', {}, status.label)
          ]),
          createElement('strong', { class: 'account-order-code' }, `#${order.orderCode || 'Pedido'}`)
        ]),
        createElement('div', { class: 'account-order-summary' }, [
          this.buildOrderMeta('payment', 'Pagamento:', this.formatPaymentMethod(order.paymentMethod)),
          this.buildOrderMeta('box', 'Itens:', `${quantity} ${quantity === 1 ? 'item' : 'itens'}`),
          this.buildOrderMeta('tag', 'Cupom:', order.couponCode || 'Nenhum', order.couponCode ? 'coupon-highlight' : 'coupon-muted')
        ])
      ]),
      createElement('div', { class: 'account-order-right' }, [
        createElement('strong', { class: 'account-order-total' }, formatMoney(order.totalInCents, 'BRL')),
        createElement('span', { class: 'account-order-date' }, this.formatOrderDate(order.createdAt || order.updatedAt)),
        this.isPaidOrder(order)
          ? createElement('button', { type: 'button', class: 'button-primary', 'data-order-thank-you': order.orderCode }, this.reviewService.getByOrderId(order.orderCode) ? 'Ver agradecimento' : 'Avaliar compra')
          : this.canContinuePayment(order)
          ? createElement('button', { type: 'button', class: 'button-primary', 'data-continue-payment': order.orderCode }, 'Continuar pagamento')
          : createElement('button', { type: 'button', class: 'button-secondary', 'data-order-details': order.orderCode }, [
            createElement('span', { class: 'details-eye-icon', 'aria-hidden': 'true' }, ''),
            createElement('span', {}, 'Ver detalhes')
          ])
      ])
    ]);
  }

  buildOrderMeta(icon, label, value, valueClass = '') {
    return createElement('span', { class: 'account-order-meta' }, [
      createElement('i', { class: `order-meta-icon ${icon}`, 'aria-hidden': 'true' }, ''),
      createElement('small', {}, label),
      createElement('strong', { class: valueClass }, value)
    ]);
  }

  getCustomerOrders() {
    const source = this.accountOrdersLoaded ? this.accountOrders : this.localOrderRepository.list();
    return source
      .filter((order) => this.orderBelongsToCurrentCustomer(order))
      .sort((a, b) => this.getOrderTime(b) - this.getOrderTime(a));
  }

  async refreshCustomerOrders() {
    const identity = this.getCustomerIdentity();
    if (!identity.email) return;
    this.accountOrdersLoading = true;
    this.accountOrdersError = '';
    this.render();
    const localOrders = this.localOrderRepository.list().filter((order) => this.orderBelongsToCurrentCustomer(order));
    try {
      await this.loadProductCatalog();
      const params = new URLSearchParams({
        email: identity.email,
        userId: identity.userId || ''
      });
      const response = await fetch(`/api/customer/orders?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'X-Customer-Email': identity.email,
          'X-Customer-User-Id': identity.userId || ''
        }
      });
      if (!response.ok) throw new Error('Nao foi possivel carregar seus pedidos agora.');
      const data = await response.json().catch(() => ({}));
      const remoteOrders = Array.isArray(data.orders) ? data.orders : [];
      this.accountOrders = this.mergeOrders(localOrders, remoteOrders).filter((order) => this.orderBelongsToCurrentCustomer(order));
    } catch (error) {
      this.accountOrders = localOrders;
      this.accountOrdersError = localOrders.length > 0 ? '' : (error.message || 'Nao foi possivel carregar seus pedidos agora.');
    } finally {
      this.accountOrdersLoaded = true;
      this.accountOrdersLoading = false;
      this.render();
    }
  }

  mergeOrders(...groups) {
    const byCode = new Map();
    groups.flat().filter(Boolean).forEach((order) => {
      const code = String(order.orderCode || order.public_code || '').trim().toUpperCase();
      if (!code) return;
      byCode.set(code, { ...(byCode.get(code) || {}), ...order, orderCode: code });
    });
    return Array.from(byCode.values());
  }

  getCustomerIdentity() {
    const user = this.currentUser || this.authService.getCurrentUser() || {};
    return {
      userId: String(user.id || this.session?.userId || '').trim(),
      email: String(user.email || this.session?.email || '').trim().toLowerCase()
    };
  }

  orderBelongsToCurrentCustomer(order) {
    const identity = this.getCustomerIdentity();
    if (!identity.email) return false;
    const orderUserId = String(order.customerUserId || order.customer_user_id || order.userId || '').trim();
    if (orderUserId && identity.userId) return orderUserId === identity.userId;
    if (orderUserId && !identity.userId) return false;
    const orderEmail = String(order.email || order.customerEmail || order.customer_email || '').trim().toLowerCase();
    return Boolean(orderEmail && orderEmail === identity.email);
  }

  filterCustomerOrders(orders) {
    const term = String(this.accountOrderSearch || '').trim().toLowerCase();
    return orders.filter((order) => {
      const bucket = this.getOrderFilterBucket(order);
      const matchesFilter = this.accountOrderFilter === 'all' || bucket === this.accountOrderFilter;
      const text = [
        order.orderCode,
        order.couponCode,
        this.getOrderItems(order).map((item) => item.productName || item.seedName).join(' ')
      ].join(' ').toLowerCase();
      return matchesFilter && (!term || text.includes(term));
    });
  }

  getSelectedCustomerOrder(orders) {
    if (!this.selectedOrderCode) return null;
    return orders.find((order) => String(order.orderCode || '').toUpperCase() === this.selectedOrderCode.toUpperCase()) || null;
  }

  isPaidOrder(order) {
    const payment = String(order?.paymentStatus || '').toLowerCase();
    const status = String(order?.status || order?.orderStatus || '').toLowerCase();
    const delivery = String(order?.deliveryStatus || '').toLowerCase();
    return ['confirmed', 'paid', 'approved'].includes(payment) || ['paid', 'delivered'].includes(status) || delivery === 'delivered';
  }

  getThankYouOrder() {
    if (!this.thankYouOrderCode) return null;
    return this.getCustomerOrders().find((order) => String(order.orderCode || '').toUpperCase() === this.thankYouOrderCode.toUpperCase()) || null;
  }

  openNewPaidOrderThankYou(orders) {
    if (this.thankYouOrderCode || !Array.isArray(orders) || orders.length === 0) return;
    const order = orders.find((item) => this.isPaidOrder(item) && !this.reviewService.hasSeenThankYou(item.orderCode));
    if (!order) return;
    this.thankYouOrderCode = order.orderCode;
    this.reviewService.markThankYouSeen(order.orderCode);
  }

  openThankYou(orderCode) {
    const order = this.getCustomerOrders().find((item) => String(item.orderCode || '').toUpperCase() === String(orderCode || '').toUpperCase());
    if (!order || !this.isPaidOrder(order)) return;
    this.thankYouOrderCode = order.orderCode;
    this.reviewService.markThankYouSeen(order.orderCode);
    this.reviewMessage = '';
    this.reviewError = '';
    this.render();
  }

  buildThankYouModal(order) {
    const items = this.getOrderItems(order);
    const existingReview = this.reviewService.getByOrderId(order.orderCode);
    const overlay = createElement('div', { class: 'thank-you-overlay' }, [
      createElement('section', { class: 'thank-you-card', 'aria-labelledby': 'thank-you-title' }, [
        createElement('button', { type: 'button', class: 'thank-you-close', 'data-action': 'close-thank-you', 'aria-label': 'Fechar' }, ''),
        createElement('span', { class: 'thank-you-success-icon', 'aria-hidden': 'true' }, ''),
        createElement('span', { class: 'garden-kicker' }, 'Pagamento confirmado'),
        createElement('h2', { id: 'thank-you-title' }, 'Obrigado pela compra!'),
        createElement('p', { class: 'thank-you-subtitle' }, 'Seu pedido foi confirmado com sucesso e ja esta sendo processado.'),
        createElement('div', { class: 'thank-you-summary' }, [
          this.buildDetailLine('Codigo do pedido', `#${order.orderCode}`),
          this.buildDetailLine('Produtos', items.map((item) => item.productName || item.seedName).join(', ')),
          this.buildDetailLine('Total pago', formatMoney(order.totalInCents, 'BRL')),
          this.buildDetailLine('Status', this.getOrderVisualStatus(order).label),
          this.buildDetailLine('Data', this.formatOrderDate(order.createdAt || order.updatedAt)),
          this.buildDetailLine('Nick Roblox', order.robloxUsername ? `@${order.robloxUsername}` : 'Nao informado')
        ]),
        existingReview
          ? createElement('div', { class: 'thank-you-reviewed' }, [
            createElement('strong', {}, 'Voce ja avaliou esta compra.'),
            createElement('span', { class: 'review-stars-static', 'aria-label': `${existingReview.rating} de 5 estrelas` }, '★'.repeat(existingReview.rating) + '☆'.repeat(5 - existingReview.rating)),
            existingReview.comment ? createElement('p', {}, existingReview.comment) : null
          ])
          : this.buildReviewForm(order),
        this.reviewError ? createElement('p', { class: 'checkout-message error' }, this.reviewError) : null,
        this.reviewMessage ? createElement('p', { class: 'checkout-message success' }, this.reviewMessage) : null,
        createElement('div', { class: 'thank-you-actions' }, [
          createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'thank-you-orders' }, 'Ver meus pedidos'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'thank-you-store' }, 'Continuar comprando'),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'thank-you-support' }, 'Falar com suporte')
        ])
      ])
    ]);
    overlay.querySelector('[data-action="close-thank-you"]').addEventListener('click', () => { this.thankYouOrderCode = ''; this.render(); });
    overlay.querySelector('[data-review-form]')?.addEventListener('submit', (event) => this.submitReview(event, order));
    overlay.querySelector('[data-action="thank-you-orders"]').addEventListener('click', () => { this.thankYouOrderCode = ''; this.profileOpen = true; this.render(); });
    overlay.querySelector('[data-action="thank-you-store"]').addEventListener('click', () => { this.thankYouOrderCode = ''; this.onSelect('grow-garden'); });
    overlay.querySelector('[data-action="thank-you-support"]').addEventListener('click', () => { this.thankYouOrderCode = ''; this.render(); window.dispatchEvent(new CustomEvent('thur-blox-open-support')); });
    return overlay;
  }

  buildReviewForm() {
    return createElement('form', { class: 'purchase-review-form', 'data-review-form': 'true', novalidate: 'novalidate' }, [
      createElement('div', {}, [
        createElement('strong', {}, 'Conta pra gente como foi sua experiencia na Thur Blox.'),
        createElement('p', {}, 'Escolha uma nota de 1 a 5 estrelas. O comentario e opcional.')
      ]),
      createElement('fieldset', { class: 'review-rating' }, [
        createElement('legend', {}, 'Sua nota'),
        ...[1, 2, 3, 4, 5].map((rating) => createElement('label', {}, [
          createElement('input', { type: 'radio', name: 'rating', value: String(rating) }),
          createElement('span', { 'aria-hidden': 'true' }, '★'),
          createElement('small', {}, String(rating))
        ]))
      ]),
      createElement('label', { class: 'review-comment-field' }, [
        createElement('span', {}, 'Comentario (opcional)'),
        createElement('textarea', { name: 'comment', maxlength: '1000', placeholder: 'Conte como foi sua experiencia...' })
      ]),
      createElement('button', { type: 'submit', class: 'button-primary' }, 'Enviar avaliacao')
    ]);
  }

  submitReview(event, order) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    this.reviewError = '';
    this.reviewMessage = '';
    try {
      this.reviewService.create({
        orderId: order.orderCode,
        customerName: order.customerName || order.customer_name || this.currentUser?.name || 'Cliente',
        robloxNick: order.robloxUsername || '', rating: data.get('rating'), comment: data.get('comment'),
        productNames: this.getOrderItems(order).map((item) => item.productName || item.seedName || 'Produto'),
        total: order.totalInCents
      });
      this.reviewMessage = 'Obrigado pelo seu comentario! Sua opiniao ajuda a melhorar a Thur Blox.';
    } catch (error) {
      this.reviewError = error.message || 'Nao foi possivel enviar sua avaliacao.';
    }
    this.render();
  }

  buildEmptyOrdersState(isEmptyAccount) {
    return createElement('div', { class: 'account-orders-empty' }, [
      createElement('strong', {}, isEmptyAccount ? 'Você ainda não fez nenhuma compra.' : 'Nenhum pedido encontrado.'),
      createElement('p', {}, isEmptyAccount ? 'Quando comprar na loja, seus pedidos aparecem aqui.' : 'Tente outro filtro ou busque pelo codigo do pedido.'),
      createElement('button', { type: 'button', class: 'button-primary', 'data-action': 'account-store' }, 'Ver produtos')
    ]);
  }

  buildCustomerOrderDetails(order) {
    const items = this.getOrderItems(order);
    const status = this.getOrderVisualStatus(order);
    const history = this.getOrderHistory(order);
    const hasPix = Boolean(order.pixPayload || order.pixCopyPasteCode || order.pixCopyPaste);
    return createElement('section', { class: 'account-order-details' }, [
      createElement('div', { class: 'account-order-details-top' }, [
        createElement('div', {}, [
          createElement('span', { class: `account-status-line ${status.tone}` }, [
            createElement('i', { class: 'account-status-dot', 'aria-hidden': 'true' }, ''),
            createElement('strong', {}, status.label)
          ]),
          createElement('h3', {}, `#${order.orderCode}`)
        ]),
        this.canContinuePayment(order)
          ? createElement('button', { type: 'button', class: 'button-primary', 'data-continue-payment': order.orderCode }, 'Continuar pagamento')
          : null
      ]),
      createElement('div', { class: 'account-detail-grid' }, [
        this.buildDetailLine('Data', this.formatOrderDate(order.createdAt || order.updatedAt)),
        this.buildDetailLine('Cliente', order.customerName || order.customer_name || this.currentUser?.name || 'Cliente'),
        this.buildDetailLine('E-mail', order.email || order.customerEmail || order.customer_email || this.session?.email || ''),
        this.buildDetailLine('Nick Roblox', order.robloxUsername ? `@${order.robloxUsername}` : 'Nao informado'),
        this.buildDetailLine('Pagamento', this.formatPaymentMethod(order.paymentMethod)),
        this.buildDetailLine('Status do pagamento', status.label),
        this.buildDetailLine('Status da entrega', this.getDeliveryStatusLabel(order)),
        this.buildDetailLine('Cupom', order.couponCode || 'Sem cupom'),
        this.buildDetailLine('Desconto', `-${formatMoney(order.discountInCents || 0, 'BRL')}`),
        this.buildDetailLine('Total', formatMoney(order.totalInCents, 'BRL'))
      ]),
      createElement('div', { class: 'account-detail-items' }, [
        createElement('strong', {}, 'Produtos comprados'),
        ...items.map((item) => this.buildOrderDetailItem(item))
      ]),
      this.canContinuePayment(order) ? this.buildAccountPixResume(order, hasPix) : null,
      createElement('div', { class: 'account-delivery-note' }, [
        createElement('strong', {}, 'Instrucoes de entrega'),
        createElement('p', {}, order.deliveryInstructions || 'Apos a confirmacao do pagamento, aguarde o contato da equipe para receber os itens no Roblox.')
      ]),
      history.length > 0 ? createElement('div', { class: 'account-order-history' }, [
        createElement('strong', {}, 'Historico do pedido'),
        ...history.map((entry) => createElement('span', {}, entry))
      ]) : null
    ]);
  }

  buildOrderDetailsModal(order) {
    const overlay = createElement('div', { class: 'order-details-overlay' }, [
      createElement('section', { class: 'order-details-modal' }, [
        createElement('div', { class: 'order-details-modal-top' }, [
          createElement('div', {}, [
            createElement('small', {}, 'Detalhes do pedido'),
            createElement('strong', {}, `#${order.orderCode}`)
          ]),
          createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'close-order-details' }, 'Fechar')
        ]),
        this.buildCustomerOrderDetails(order)
      ])
    ]);
    overlay.querySelector('[data-action="close-order-details"]').addEventListener('click', () => {
      this.selectedOrderCode = '';
      this.paymentResumeMessage = '';
      this.paymentResumeStatus = '';
      this.render();
    });
    overlay.querySelectorAll('[data-continue-payment]').forEach((button) => {
      button.addEventListener('click', () => this.continueCustomerPayment(button.getAttribute('data-continue-payment')));
    });
    overlay.querySelector('[data-copy-pix]')?.addEventListener('click', () => this.copyOrderPix(order));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        this.selectedOrderCode = '';
        this.render();
      }
    });
    return overlay;
  }

  buildAccountPixResume(order, hasPix) {
    return createElement('div', { class: 'account-pix-resume' }, [
      createElement('strong', {}, 'Pagamento Pix deste pedido'),
      hasPix ? createElement('p', {}, 'Use o Pix abaixo para continuar o mesmo pedido, sem criar uma nova compra.') : createElement('p', {}, 'A cobranca Pix precisa ser gerada novamente para este pedido.'),
      order.pixQrImageUrl ? createElement('img', { src: order.pixQrImageUrl, alt: `QR Code Pix do pedido ${order.orderCode}`, loading: 'lazy' }) : null,
      hasPix ? createElement('textarea', { readonly: true, rows: 4 }, order.pixPayload || order.pixCopyPasteCode || order.pixCopyPaste || '') : null,
      this.paymentResumeMessage ? createElement('p', { class: `checkout-message ${this.paymentResumeStatus}` }, this.paymentResumeMessage) : null,
      hasPix ? createElement('button', { type: 'button', class: 'button-secondary', 'data-copy-pix': order.orderCode }, 'Copiar codigo Pix') : null,
      createElement('button', { type: 'button', class: 'button-primary', 'data-continue-payment': order.orderCode }, hasPix ? 'Continuar pagamento' : 'Gerar cobranca Pix')
    ]);
  }

  buildOrderDetailItem(item) {
    const image = item.image || this.findProductImage(item.productSlug || item.seedSlug);
    return createElement('article', { class: 'account-detail-item' }, [
      image ? createElement('img', { src: image, alt: item.productName || item.seedName || 'Produto', loading: 'lazy' }) : createElement('span', { class: 'account-detail-item-placeholder' }, 'BL'),
      createElement('div', {}, [
        createElement('strong', {}, item.productName || item.seedName || 'Produto'),
        createElement('small', {}, `${item.quantity || 1}x ${formatMoney(item.unitPriceInCents || 0, 'BRL')}`)
      ]),
      createElement('span', {}, formatMoney(item.subtotalInCents || 0, 'BRL'))
    ]);
  }

  buildDetailLine(label, value) {
    return createElement('span', { class: 'account-detail-line' }, [
      createElement('small', {}, label),
      createElement('strong', {}, value || 'Nao informado')
    ]);
  }

  async continueCustomerPayment(orderCode) {
    const order = this.getCustomerOrders().find((item) => String(item.orderCode || '').toUpperCase() === String(orderCode || '').toUpperCase());
    if (!order || !this.orderBelongsToCurrentCustomer(order)) {
      this.paymentResumeMessage = 'Pedido nao encontrado nesta conta.';
      this.paymentResumeStatus = 'error';
      this.render();
      return;
    }
    this.selectedOrderCode = order.orderCode;
    if (this.hasUsablePixCharge(order)) {
      this.paymentResumeMessage = 'Cobranca Pix aberta para este pedido.';
      this.paymentResumeStatus = 'success';
      this.render();
      return;
    }
    try {
      const identity = this.getCustomerIdentity();
      const response = await fetch(`/api/customer/orders/${encodeURIComponent(order.orderCode)}/pix`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-Email': identity.email,
          'X-Customer-User-Id': identity.userId || ''
        },
        body: JSON.stringify({ email: identity.email, userId: identity.userId || '' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel continuar o pagamento.');
      const updatedOrder = data.order || data;
      this.accountOrders = this.mergeOrders(this.accountOrders, [updatedOrder]);
      this.localOrderRepository.update(order.orderCode, updatedOrder);
      this.paymentResumeMessage = 'Cobranca Pix pronta para este pedido.';
      this.paymentResumeStatus = 'success';
    } catch (error) {
      this.paymentResumeMessage = error.message || 'Nao foi possivel continuar o pagamento.';
      this.paymentResumeStatus = 'error';
    }
    this.render();
  }

  async copyOrderPix(order) {
    const text = order?.pixPayload || order?.pixCopyPasteCode || order?.pixCopyPaste || '';
    if (!text) return;
    await navigator.clipboard?.writeText(text).catch(() => {});
    this.paymentResumeMessage = 'Codigo Pix copiado.';
    this.paymentResumeStatus = 'success';
    this.render();
  }

  async loadProductCatalog() {
    if (this.productCatalogLoaded) return;
    try {
      const response = await fetch(STORE_PRODUCTS_URL, { cache: 'no-store' });
      const data = await response.json();
      this.productCatalog = Array.isArray(data.products) ? data.products : [];
    } catch {
      this.productCatalog = [];
    } finally {
      this.productCatalogLoaded = true;
    }
  }

  findProductImage(slug) {
    return this.productCatalog.find((product) => product.slug === slug)?.image || '';
  }

  getOrderItems(order) {
    if (Array.isArray(order.items) && order.items.length > 0) return order.items;
    return [{
      productSlug: order.productSlug || order.seedSlug,
      productName: order.productName || order.seedName || 'Produto',
      seedName: order.seedName || order.productName || 'Produto',
      quantity: order.quantity || 1,
      unitPriceInCents: order.unitPriceInCents || order.totalInCents || 0,
      subtotalInCents: order.subtotalInCents || order.totalInCents || 0,
      image: order.image || order.productImage || ''
    }];
  }

  getOrderItemQuantity(order) {
    return this.getOrderItems(order).reduce((total, item) => total + Number(item.quantity || 0), 0);
  }

  getOrderTime(order) {
    const time = new Date(order.createdAt || order.updatedAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  getOrderVisualStatus(order) {
    const payment = String(order.paymentStatus || '').toLowerCase();
    const delivery = String(order.deliveryStatus || order.orderStatus || '').toLowerCase();
    const raw = delivery === 'delivered' ? 'delivered' : (payment || delivery || 'pending');
    if (delivery === 'delivered') return { label: 'Pedido entregue', tone: 'delivered' };
    if (['confirmed', 'paid', 'approved'].includes(payment)) return { label: PAYMENT_STATUS_LABELS[payment] || 'Pagamento aprovado!', tone: 'approved' };
    if (['cancelled', 'canceled', 'failed'].includes(payment) || ['cancelled', 'canceled'].includes(delivery)) return { label: 'Pedido cancelado', tone: 'cancelled' };
    return { label: PAYMENT_STATUS_LABELS[raw] || 'Pagamento pendente', tone: 'pending' };
  }

  getOrderFilterBucket(order) {
    const payment = String(order.paymentStatus || '').toLowerCase();
    const delivery = String(order.deliveryStatus || order.orderStatus || '').toLowerCase();
    if (delivery === 'delivered') return 'delivered';
    if (['cancelled', 'canceled', 'failed', 'refunded'].includes(payment) || ['cancelled', 'canceled', 'refunded'].includes(delivery)) return 'cancelled';
    if (['confirmed', 'paid', 'approved'].includes(payment) || delivery === 'paid') return 'approved';
    return 'pending';
  }

  getDeliveryStatusLabel(order) {
    const status = String(order.deliveryStatus || order.orderStatus || 'pending').toLowerCase();
    return DELIVERY_STATUS_LABELS[status] || 'Aguardando pagamento';
  }

  formatPaymentMethod(value) {
    return String(value || 'pix').toLowerCase() === 'pix' ? 'Pix' : String(value || 'Pix');
  }

  formatOrderDate(value) {
    if (!value) return 'Data indisponivel';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Data indisponivel';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  getOrderHistory(order) {
    const history = [];
    if (order.createdAt) history.push(`Pedido criado em ${this.formatOrderDate(order.createdAt)}.`);
    if (order.paidAt) history.push(`Pagamento aprovado em ${this.formatOrderDate(order.paidAt)}.`);
    if (order.updatedAt) history.push(`Ultima atualizacao em ${this.formatOrderDate(order.updatedAt)}.`);
    if (order.adminNote) history.push(order.adminNote);
    return history;
  }

  canContinuePayment(order) {
    const payment = String(order.paymentStatus || '').toLowerCase();
    const orderStatus = String(order.orderStatus || '').toLowerCase();
    return !['confirmed', 'paid', 'approved', 'cancelled', 'canceled', 'failed', 'refunded'].includes(payment)
      && !['paid', 'delivered', 'cancelled', 'canceled', 'refunded'].includes(orderStatus);
  }

  hasUsablePixCharge(order) {
    const expiresAt = order.pixExpiresAt ? new Date(order.pixExpiresAt).getTime() : 0;
    return Boolean(order.pixPayload || order.pixCopyPasteCode || order.pixCopyPaste) && (!expiresAt || expiresAt > Date.now());
  }

  getCustomerInitials(value) {
    return String(value || 'CL')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'CL';
  }

  buildHero() {
    const hero = createElement('section', { class: 'portal-hero' }, [
      createElement('div', { class: 'portal-hero-copy' }, [
        createElement('h1', {}, 'TUDO MAIS FÁCIL NO THUR BLOX!'),
        createElement('p', {}, 'Encontre produtos digitais dos seus jogos favoritos em um só lugar.'),
        createElement('button', { type: 'button', class: 'button-primary hero-cta', 'data-action': 'see-games', 'aria-label': 'Ir para categorias' }, [
          createElement('span', { class: 'category-button-icon', 'aria-hidden': 'true' }, ''),
          createElement('span', {}, 'Categorias')
        ])
      ]),
      createElement('div', { class: 'portal-hero-art' }, [
        createElement('div', { class: 'portal-showcase', 'aria-hidden': 'true' }, [
          createElement('div', { class: 'portal-showcase-card garden-showcase-card' }, [
            createElement('img', { src: PORTAL_CARD_IMAGES['grow-garden'], alt: '', class: 'portal-showcase-image garden-showcase' })
          ]),
          createElement('div', { class: 'portal-showcase-card blox-fruits-showcase-card' }, [
            createElement('img', { src: PORTAL_CARD_IMAGES['blox-fruits'], alt: '', class: 'portal-showcase-image blox-fruits-showcase' })
          ]),
          createElement('div', { class: 'portal-showcase-logo-card' }, [
            createElement('img', { src: APP_LOGO, alt: '', class: 'portal-showcase-logo' })
          ])
        ])
      ]),
      createElement('button', { type: 'button', class: 'hero-scroll-button', 'data-action': 'see-games-secondary', 'aria-label': 'Descer para categorias' }, '')
    ]);

    hero.querySelectorAll('[data-action^="see-games"]').forEach((button) => {
      button.addEventListener('click', () => this.scrollToGames());
    });
    return hero;
  }

  buildCategoryPill() {
    return createElement('button', { type: 'button', class: 'category-pill', 'data-action': 'see-games', 'aria-label': 'Ir para categorias' }, [
      createElement('span', { class: 'category-button-icon', 'aria-hidden': 'true' }, ''),
      createElement('span', {}, 'Categorias')
    ]);
  }

  buildGamesSection() {
    const section = createElement('section', { class: 'portal-games', 'aria-labelledby': 'portal-games-title' }, [
      createElement('h2', { id: 'portal-games-title', class: 'visually-hidden' }, 'Categorias'),
      createElement('div', { class: 'portal-game-grid' }, GAME_CARDS.map((card) => this.buildGameCard(card))),
      createElement('p', { class: 'portal-search-empty', hidden: 'hidden' }, 'Nenhuma categoria encontrada.')
    ]);
    this.gameSection = section.querySelector('.portal-game-grid');
    this.emptySearch = section.querySelector('.portal-search-empty');
    this.applyCategoryFilter();
    return section;
  }

  buildGameCard({ slug, title, subtitle, image, alt, tags, action, icon, tone, maintenanceLabel }) {
    const searchText = [title, subtitle, ...tags].join(' ').toLowerCase();
    const card = createElement('button', {
      type: 'button',
      class: `portal-game-card ${tone}-card ${maintenanceLabel ? 'is-maintenance' : ''}`,
      'aria-label': `${action}: ${title}`,
      'data-search-text': searchText
    }, [
      createElement('div', { class: 'game-card-image' }, [
        createElement('img', { src: image, alt, class: 'portal-card-image' })
      ]),
      createElement('div', { class: 'game-card-body' }, [
        maintenanceLabel ? createElement('span', { class: 'game-card-status' }, maintenanceLabel) : null,
        createElement('span', { class: 'game-card-icon', 'aria-hidden': 'true' }, icon),
        createElement('strong', {}, title),
        createElement('p', {}, subtitle),
        createElement('span', { class: 'game-card-action' }, [
          createElement('span', {}, action),
          createElement('span', { class: 'action-arrow', 'aria-hidden': 'true' }, '')
        ])
      ])
    ]);
    card.addEventListener('click', () => this.onSelect(slug));
    return card;
  }

  buildBenefitsSection() {
    const section = createElement('section', { class: 'portal-benefits', 'aria-labelledby': 'portal-benefits-title' }, [
      createElement('h2', { id: 'portal-benefits-title', class: 'visually-hidden' }, 'Benefícios'),
      createElement('div', { class: 'portal-benefits-grid' }, BENEFITS.map((benefit) => createElement('article', { class: 'portal-benefit-item' }, [
        createElement('span', { class: 'benefit-icon', 'data-icon': benefit.icon, 'aria-hidden': 'true' }, ''),
        createElement('div', {}, [
          createElement('strong', {}, benefit.title),
          createElement('p', {}, benefit.text)
        ])
      ])))
    ]);
    this.benefitsSection = section;
    return section;
  }

  buildReviewsSection() {
    const approvedReviews = this.reviewService.list()
      .filter((review) => review.status === 'approved')
      .map((review) => ({
        initials: this.getCustomerInitials(review.customerName),
        name: review.customerName || 'Cliente Thur Blox',
        date: this.formatReviewDate(review.createdAt),
        text: review.comment || 'Compra concluída com sucesso.',
        product: review.productNames?.join(', ') || 'Produto digital',
        productImage: '/assets/brand/delima-blox-logo.webp',
        rating: review.rating
      }));
    const sourceReviews = approvedReviews.length > 0 ? approvedReviews : CUSTOMER_REVIEWS;
    const reviews = [...sourceReviews, ...sourceReviews];
    const section = createElement('section', { class: 'portal-reviews', 'aria-labelledby': 'portal-reviews-title' }, [
      createElement('div', { class: 'portal-reviews-heading' }, [
        createElement('span', { class: 'reviews-eyebrow' }, [
          createElement('span', { class: 'reviews-eyebrow-icon', 'aria-hidden': 'true' }, ''),
          createElement('span', {}, 'Avaliações')
        ]),
        createElement('h2', { id: 'portal-reviews-title' }, 'O que nossos clientes dizem'),
        createElement('p', {}, 'Veja o feedback de quem já comprou com a gente.')
      ]),
      createElement('div', { class: 'reviews-marquee', 'aria-label': 'Avaliações dos clientes' }, [
        createElement('div', { class: 'reviews-track' }, reviews.map((review, index) => this.buildReviewCard(review, index, sourceReviews.length)))
      ])
    ]);
    section.querySelectorAll('[data-action="view-review-product"]').forEach((button) => {
      button.addEventListener('click', () => this.onSelect('grow-garden'));
    });
    return section;
  }

  buildReviewCard(review, index, duplicateStart = CUSTOMER_REVIEWS.length) {
    return createElement('article', { class: 'review-card', 'aria-hidden': index >= duplicateStart ? 'true' : null }, [
      createElement('div', { class: 'review-card-top' }, [
        createElement('span', { class: 'review-avatar' }, review.initials),
        createElement('div', { class: 'review-author' }, [
          createElement('strong', {}, review.name),
          createElement('span', {}, review.date)
        ])
      ]),
      createElement('p', { class: 'review-text' }, `"${review.text}"`),
      createElement('div', { class: 'review-stars', 'aria-label': `${review.rating || 5} de 5 estrelas` }, Array.from({ length: review.rating || 5 }, () => (
        createElement('span', { class: 'review-star', 'aria-hidden': 'true' }, '')
      ))),
      createElement('div', { class: 'review-product-row' }, [
        createElement('span', { class: 'review-product-thumb' }, [
          createElement('img', { src: review.productImage, alt: '', loading: 'lazy', decoding: 'async' })
        ]),
        createElement('strong', {}, review.product),
        createElement('button', {
          type: 'button',
          class: 'review-view-button',
          'data-action': 'view-review-product',
          tabindex: index >= duplicateStart ? '-1' : null
        }, [
          createElement('span', {}, 'Ver'),
          createElement('span', { class: 'review-view-arrow', 'aria-hidden': 'true' }, '')
        ])
      ])
    ]);
  }

  formatReviewDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Avaliação verificada';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  }

  buildFaqSection() {
    return createElement('section', { class: 'portal-faq', 'aria-labelledby': 'portal-faq-title' }, [
      createElement('div', { class: 'portal-faq-heading' }, [
        createElement('span', { class: 'reviews-eyebrow' }, 'Ajuda'),
        createElement('h2', { id: 'portal-faq-title' }, 'Perguntas frequentes'),
        createElement('p', {}, 'Informações rápidas para comprar com tranquilidade.')
      ]),
      createElement('div', { class: 'portal-faq-list' }, FAQ_ITEMS.map(([question, answer], index) => (
        createElement('details', { class: 'portal-faq-item', open: index === 0 ? 'open' : null }, [
          createElement('summary', {}, [
            createElement('strong', {}, question),
            createElement('span', { 'aria-hidden': 'true' }, '+')
          ]),
          createElement('p', {}, answer)
        ])
      )))
    ]);
  }

  buildFooter() {
    const footer = createElement('footer', { class: 'portal-footer' }, [
      createElement('div', { class: 'portal-footer-brand' }, [
        createElement('strong', {}, 'THUR BLOX / DELIMA BLOX'),
        createElement('span', {}, 'Produtos digitais dos seus jogos favoritos em um só lugar.'),
        createElement('small', {}, 'Loja independente. Não somos afiliados oficialmente à Roblox ou a qualquer jogo citado.')
      ]),
      createElement('nav', { class: 'portal-footer-nav', 'aria-label': 'Links do rodapé' }, [
        createElement('button', { type: 'button', class: 'portal-footer-link', 'data-footer-action': 'home' }, 'Início'),
        createElement('button', { type: 'button', class: 'portal-footer-link', 'data-footer-action': 'grow-garden' }, 'Grow a Garden 2'),
        createElement('button', { type: 'button', class: 'portal-footer-link', 'data-footer-action': 'blox-fruits' }, 'Blox Fruits'),
        createElement('button', { type: 'button', class: 'portal-footer-link', 'data-footer-action': 'orders' }, 'Meus pedidos'),
        createElement('button', { type: 'button', class: 'portal-footer-link', 'data-footer-action': 'terms' }, 'Termos'),
        createElement('button', { type: 'button', class: 'portal-footer-link', 'data-footer-action': 'support' }, 'Suporte')
      ]),
      createElement('span', { class: 'portal-footer-year' }, `© ${new Date().getFullYear()} THUR BLOX`)
    ]);
    footer.querySelectorAll('[data-footer-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.getAttribute('data-footer-action');
      if (action === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
      else if (action === 'orders') this.openProfilePage('orders');
      else if (action === 'support') window.dispatchEvent(new CustomEvent('thur-blox-open-support'));
      else this.onSelect(action);
    }));
    return footer;
  }

  applyCategoryFilter() {
    if (!this.gameSection) return;
    const term = this.searchTerm.trim().toLowerCase();
    let visibleCount = 0;
    this.gameSection.querySelectorAll('.portal-game-card').forEach((card) => {
      const visible = !term || card.getAttribute('data-search-text').includes(term);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    if (this.emptySearch) this.emptySearch.hidden = visibleCount > 0;
  }

  scrollToGames() {
    this.gameSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
