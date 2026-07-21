import { SupportChatWidget } from './SupportChatWidget.js';
import { createElement } from './ui-utils.js';

const APP_LOGO = '/assets/brand/delima-blox-logo.webp';

const TERMS = [
  ['1. Produtos digitais', 'A THUR BLOX comercializa itens e utilidades digitais descritos nas páginas dos produtos. Antes da compra, confira nome, quantidade, preço, disponibilidade e instruções de entrega.'],
  ['2. Entrega manual', 'A entrega é realizada manualmente após a confirmação do pagamento e depende da disponibilidade da equipe e do ambiente do jogo. O cliente deve acompanhar o pedido e responder ao suporte quando solicitado.'],
  ['3. Dados do cliente', 'O cliente é responsável por informar corretamente seu nome, e-mail e nick utilizado no jogo. Dados incorretos podem atrasar ou impedir a entrega. Nunca solicitamos senha, cookie ou código de autenticação em duas etapas.'],
  ['4. Pagamento via Pix', 'O valor do pedido é definido pelo sistema e deve ser pago pelo QR Code ou código Pix copia e cola exibido no checkout. A confirmação pode depender do processamento do pagamento. Não altere o valor da transação.'],
  ['5. Suporte e garantia', 'Problemas comprovados na entrega devem ser informados pelo chat do próprio site, com o código do pedido e detalhes suficientes para análise. A equipe poderá solicitar evidências que não incluam dados de acesso à conta.'],
  ['6. Cancelamento e reembolso', 'Pedidos ainda não pagos podem ser cancelados. Solicitações após pagamento ou entrega serão analisadas conforme o estágio do pedido, a natureza digital do item e a legislação aplicável. Não há reembolso quando o item já foi entregue corretamente ou consumido, salvo obrigação legal.'],
  ['7. Segurança da conta', 'O cliente deve seguir as regras da plataforma e proteger sua própria conta. A THUR BLOX não se responsabiliza por compartilhamento de credenciais, uso indevido do item, punições da plataforma ou informações incorretas fornecidas pelo cliente.'],
  ['8. Independência da loja', 'A THUR BLOX é uma loja independente. Não é oficial, patrocinada, endossada ou afiliada à Roblox Corporation nem aos criadores dos jogos mencionados. As marcas citadas pertencem aos respectivos titulares.'],
  ['9. Privacidade', 'Os dados fornecidos são usados para criar o pedido, confirmar o pagamento, organizar a entrega, prevenir fraude e prestar suporte. Não armazenamos senha, cookie ou código de autenticação do jogo.'],
  ['10. Atualizações', 'Estes termos podem ser atualizados para refletir mudanças operacionais ou legais. A versão aplicável é a publicada no momento da compra.']
];

export class TermsPage {
  constructor({ root, onNavigate }) {
    this.root = root;
    this.onNavigate = onNavigate;
    this.render();
  }

  render() {
    const page = createElement('div', { class: 'terms-page' }, [
      createElement('header', { class: 'terms-topbar' }, [
        createElement('button', { type: 'button', class: 'terms-brand', 'data-action': 'home', 'aria-label': 'Voltar para a THUR BLOX' }, [
          createElement('img', { src: APP_LOGO, alt: '' }),
          createElement('span', {}, [createElement('strong', {}, 'THUR BLOX'), createElement('small', {}, 'Loja digital independente')])
        ]),
        createElement('button', { type: 'button', class: 'button-secondary', 'data-action': 'home' }, 'Voltar para a loja')
      ]),
      createElement('main', { class: 'terms-content' }, [
        createElement('header', { class: 'terms-hero' }, [
          createElement('span', { class: 'reviews-eyebrow' }, 'Transparência e segurança'),
          createElement('h1', {}, 'Termos e condições'),
          createElement('p', {}, 'Regras para compras, pagamentos, entrega e suporte na THUR BLOX.'),
          createElement('small', {}, `Última atualização: ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`)
        ]),
        createElement('section', { class: 'terms-security-banner' }, [
          createElement('strong', {}, 'Aviso de segurança'),
          createElement('p', {}, 'Nunca envie sua senha, cookie ou código de autenticação do Roblox.')
        ]),
        createElement('div', { class: 'terms-sections' }, TERMS.map(([title, body]) => createElement('section', {}, [
          createElement('h2', {}, title), createElement('p', {}, body)
        ]))),
        createElement('footer', { class: 'terms-disclaimer' }, 'Ao finalizar uma compra, você confirma que leu e concorda com estes termos.')
      ]),
      new SupportChatWidget().render()
    ]);
    page.querySelectorAll('[data-action="home"]').forEach((button) => button.addEventListener('click', () => this.onNavigate('home')));
    this.root.innerHTML = '';
    this.root.append(page);
  }
}
