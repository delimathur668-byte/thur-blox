import { GrowGardenModule } from './src/components/GrowGardenModule.js';
import { HomePortal } from './src/components/HomePortal.js';
import { BrainrotMaintenanceScreen } from './src/components/BrainrotMaintenanceScreen.js';
import { BRAINROT_MAINTENANCE_CONFIG } from './src/config/brainrot-maintenance-config.js';
import { AuthService } from './src/services/AuthService.js';
import { TermsPage } from './src/components/TermsPage.js';

const BRAINROTS_DATA_URL = 'src/data/brainrots.json';
const MUTATIONS_DATA_URL = 'src/data/mutations.json';
const MARKET_VALUES_DATA_URL = 'src/data/brainrot-real-trade-values.json';
const REAL_MONEY_VALUES_DATA_URL = 'src/data/brainrot/real-money-values.json';
const GAME_STATS_DATA_URL = 'src/data/brainrot-game-stats.json';
const BRAINROT_IMAGES_DATA_URL = 'src/data/brainrot-images.json';
const ROUTE_VIEW_MAP = Object.freeze({
  '/': 'home',
  '/brainrot': 'brainrot',
  '/brainrots': 'brainrot',
  '/roube-um-brainrot': 'brainrot',
  '/blox-fruits': 'blox-fruits',
  '/category/blox-fruits': 'blox-fruits',
  '/grow-garden': 'grow-garden',
  '/grow-garden-2': 'grow-garden',
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

const loadJson = async (url, fallback = []) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao buscar ${url}`);
  const data = await response.json();
  return Array.isArray(data) ? data : fallback;
};

const loadJsonDocument = async (url, fallback = {}) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao buscar ${url}`);
  const data = await response.json();
  return data && typeof data === 'object' && !Array.isArray(data) ? data : fallback;
};

const isBrainrotRoute = (value) => /^\/?(brainrot|brainrots|roube-um-brainrot)(\/|$)/i.test(String(value || ''));
const isGrowGardenRoute = (value) => /^\/?(grow-garden|grow-garden-2)(\/|$)/i.test(String(value || ''));
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

const routeForView = (view) => {
  if (view === 'brainrot') return '/';
  if (view === 'blox-fruits') return '/blox-fruits';
  if (view === 'grow-garden') return '/grow-garden-2';
  if (view === 'admin') return '/admin';
  if (view === 'terms') return '/terms';
  return '/';
};

const setBrowserRoute = (view) => {
  const nextPath = routeForView(view);
  if (window.location.pathname === nextPath && !window.location.search && !window.location.hash) return;
  window.history.pushState({ view }, '', nextPath);
};

const loadBrainrotState = async () => {
  const { BrainrotDataService } = await import('./src/services/BrainrotDataService.js');
  const [rawBrainrots, mutations, marketValues, realMoneyValues, gameStats, brainrotImages] = await Promise.all([
    loadJson(BRAINROTS_DATA_URL),
    loadJson(MUTATIONS_DATA_URL),
    loadJson(MARKET_VALUES_DATA_URL),
    loadJsonDocument(REAL_MONEY_VALUES_DATA_URL, { currency: 'BRL', items: [] }),
    loadJson(GAME_STATS_DATA_URL),
    loadJson(BRAINROT_IMAGES_DATA_URL)
  ]);

  const { brainrots, diagnostics } = BrainrotDataService.merge({
    brainrots: rawBrainrots,
    marketValues,
    gameStats,
    images: brainrotImages
  });
  if (
    diagnostics.emptySlugs.length
    || diagnostics.duplicateSlugs.length
    || diagnostics.valueWithoutPet.length
    || diagnostics.nonNumericValues.length
  ) {
    console.warn('Diagnostico dos dados de Brainrots:', diagnostics);
  }

  return {
    brainrots,
    mutations,
    realMoneyValues,
    brainrotImages
  };
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
      brainrotLoaded: false,
      brainrotData: null,
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
          brainrotMaintenance: BRAINROT_MAINTENANCE_CONFIG,
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
            brainrotMaintenance: BRAINROT_MAINTENANCE_CONFIG,
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
            brainrotMaintenance: BRAINROT_MAINTENANCE_CONFIG,
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
      } else if (state.currentView === 'brainrot') {
        if (BRAINROT_MAINTENANCE_CONFIG.enabled) {
          new BrainrotMaintenanceScreen({ root, onNavigate: navigate, config: BRAINROT_MAINTENANCE_CONFIG });
          return;
        }
        if (!state.brainrotLoaded) {
          state.brainrotData = await loadBrainrotState();
          state.brainrotLoaded = true;
        }
        const { BrainrotModule } = await import('./src/components/BrainrotModule.js');
        new BrainrotModule({ root, ...state.brainrotData, onNavigate: navigate });
      } else if (state.currentView === 'grow-garden') {
        new GrowGardenModule({ root, onNavigate: navigate, adminSession: state.authService.getSession(), authService: state.authService });
      } else if (state.currentView === 'blox-fruits') {
        new GrowGardenModule({ root, onNavigate: navigate, adminSession: state.authService.getSession(), authService: state.authService, storeGame: 'blox-fruits' });
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
