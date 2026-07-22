import { GrowGardenModule } from './src/components/GrowGardenModule.js';
import { HomePortal } from './src/components/HomePortal.js';
import { AuthService } from './src/services/AuthService.js';
import { TermsPage } from './src/components/TermsPage.js';

const ROUTE_VIEW_MAP = Object.freeze({
  '/': 'home',
  '/brainrot': 'brainrot',
  '/brainrots': 'brainrot',
  '/roube-um-brainrot': 'brainrot',
  '/blox-fruits': 'blox-fruits',
  '/category/blox-fruits': 'blox-fruits',
  '/grow-garden': 'grow-garden',
  '/grow-garden-2': 'grow-garden',
  '/category/grow-a-garden-2': 'grow-garden',
  '/terms': 'terms',
  '/termos': 'terms',
  '/admin': 'admin',
  '/painel': 'admin',
  '/support-admin': 'admin',
  '/orders-admin': 'admin',
  '/stock-admin': 'admin',
  '/suporte-admin': 'admin',
  '/pedidos-admin': 'admin',
  '/estoque': 'admin',
  '/produtos-admin': 'admin',
  '/admin/descontos': 'admin',
  '/admin/cupons': 'admin'
});

const isBrainrotRoute = (value) => /^\/?(brainrot|brainrots|roube-um-brainrot)(\/|$)/i.test(String(value || ''));
const isGrowGardenRoute = (value) => /^\/?(grow-garden|grow-garden-2|category\/grow-a-garden-2)(\/|$)/i.test(String(value || ''));
const isBloxFruitsRoute = (value) => /^\/?(blox-fruits|category\/blox-fruits)(\/|$)/i.test(String(value || ''));
const isAdminRoute = (value) => /^\/?(admin|painel|support-admin|orders-admin|stock-admin|suporte-admin|pedidos-admin|estoque|produtos-admin)(\/|$)/i.test(String(value || ''));

const getAdminInitialPanelTab = () => {
  const requested = `${window.location.pathname} ${window.location.search} ${window.location.hash}`.toLowerCase();
  if (/descont|cupom|cupons/.test(requested)) return 'discounts';
  if (/pedido|order/.test(requested)) return 'orders';
  if (/estoque|stock/.test(requested)) return 'stock';
  if (/produto|product/.test(requested)) return 'products';
  return 'support';
};

const getRequestedView = () => {
  const params = new URLSearchParams(window.location.search);
  const queryView = params.get('view') || params.get('module');
  const hashPath = window.location.hash.replace(/^#/, '').replace(/^!/, '');
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (isBrainrotRoute(queryView) || isBrainrotRoute(hashPath) || isBrainrotRoute(path)) return 'home';
  if (isBloxFruitsRoute(queryView) || isBloxFruitsRoute(hashPath) || isBloxFruitsRoute(path)) return 'blox-fruits';
  if (isGrowGardenRoute(queryView) || isGrowGardenRoute(hashPath) || isGrowGardenRoute(path)) return 'grow-garden';
  if (isAdminRoute(queryView) || isAdminRoute(hashPath) || isAdminRoute(path)) return 'admin';
  if (queryView === 'terms' || queryView === 'termos' || /^\/?(terms|termos)(\/|$)/i.test(hashPath)) return 'terms';
  return ROUTE_VIEW_MAP[path] || 'home';
};

const getStoreInitialState = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    initialTab: params.get('tab') === 'carrinho' ? 'carrinho' : 'sementes',
    initialProductSlug: params.get('produto') || ''
  };
};

const routeForView = (view) => {
  if (view === 'brainrot') return '/';
  if (view === 'blox-fruits') return '/category/blox-fruits';
  if (view === 'grow-garden') return '/category/grow-a-garden-2';
  if (view === 'admin') return '/admin';
  if (view === 'terms') return '/terms';
  return '/';
};

const setBrowserRoute = (view) => {
  const nextPath = routeForView(view);
  if (window.location.pathname === nextPath && !window.location.search && !window.location.hash) return;
  window.history.pushState({ view }, '', nextPath);
};

const initialize = async () => {
  const root = document.getElementById('app');
  if (!root) {
    console.warn('Root element not found');
    return;
  }

  try {
    const state = {
      currentView: getRequestedView(),
      authService: new AuthService()
    };

    const navigate = async (view, options = {}) => {
      state.currentView = view;
      if (!options.skipHistory) setBrowserRoute(view);
      await renderApp();
    };

    const renderApp = async () => {
      root.innerHTML = '';
      if (state.currentView === 'home') {
        new HomePortal({
          root,
          onSelect: navigate,
          authService: state.authService
        });
      } else if (state.currentView === 'terms') {
        new TermsPage({ root, onNavigate: navigate });
      } else if (state.currentView === 'admin') {
        const adminSession = state.authService.getSession();
        if (!adminSession) {
          new HomePortal({
            root,
            onSelect: navigate,
            authService: state.authService,
            initialLoginOpen: true,
            initialLoginRedirect: 'admin'
          });
          return;
        }
        if (!state.authService.isAdminSession(adminSession)) {
          new HomePortal({
            root,
            onSelect: navigate,
            authService: state.authService,
            initialAccessDenied: true
          });
          return;
        }
        new GrowGardenModule({
          root,
          onNavigate: navigate,
          initialTab: 'admin',
          initialAdminPanelTab: getAdminInitialPanelTab(),
          adminSession,
          authService: state.authService
        });
      } else if (state.currentView === 'grow-garden') {
        new GrowGardenModule({ root, onNavigate: navigate, adminSession: state.authService.getSession(), authService: state.authService, ...getStoreInitialState() });
      } else if (state.currentView === 'blox-fruits') {
        new GrowGardenModule({ root, onNavigate: navigate, adminSession: state.authService.getSession(), authService: state.authService, storeGame: 'blox-fruits', ...getStoreInitialState() });
      }
    };

    window.addEventListener('popstate', () => {
      navigate(getRequestedView(), { skipHistory: true });
    });

    await renderApp();
  } catch (error) {
    console.error('Erro ao inicializar THUR BLOX:', error);
    root.textContent = 'Nao foi possivel carregar os dados do aplicativo. Verifique o console.';
    return;
  }
};

window.addEventListener('DOMContentLoaded', initialize);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.warn('Falha ao registrar service worker:', error);
    });
  });
}
