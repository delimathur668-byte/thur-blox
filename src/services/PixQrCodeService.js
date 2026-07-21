import { validatePixPayloadCrc } from './grow-garden-2/StoreCommerceService.js';

const PIX_PAYLOAD_PREFIX = '000201';
const PIX_MERCHANT_MARKER = 'br.gov.bcb.pix';
const DEFAULT_QR_SIZE = 260;

export const getPixPayloadValidation = (payload) => {
  const value = String(payload || '').trim();
  if (!value) return { ok: false, reason: 'Nao foi possivel gerar o QR Code. Use o Pix copia e cola abaixo.' };
  if (!value.startsWith(PIX_PAYLOAD_PREFIX)) return { ok: false, reason: 'Codigo Pix em formato invalido. Use o Pix copia e cola abaixo.' };
  if (!value.toLowerCase().includes(PIX_MERCHANT_MARKER)) return { ok: false, reason: 'Codigo Pix incompleto. Use o Pix copia e cola abaixo.' };
  return {
    ok: true,
    payload: value,
    crcValid: validatePixPayloadCrc(value)
  };
};

export const renderPixQrCode = async (container, payload, { size = DEFAULT_QR_SIZE } = {}) => {
  if (!container) return { ok: false, reason: 'Container QR indisponivel.' };
  const validation = getPixPayloadValidation(payload);
  container.textContent = '';

  if (!validation.ok) {
    container.classList.add('error');
    container.textContent = validation.reason;
    return validation;
  }

  const qrCode = globalThis.QRCode;
  if (!qrCode?.toString) {
    container.classList.add('error');
    container.textContent = 'Nao foi possivel gerar o QR Code. Use o Pix copia e cola abaixo.';
    return { ok: false, reason: 'QRCode browser bundle ausente.' };
  }

  container.classList.remove('error');
  container.textContent = 'Gerando QR Code Pix...';
  try {
    const svg = await qrCode.toString(validation.payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 3,
      width: size,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    const image = new Image();
    image.className = 'pix-qr-image pix-qr-code';
    image.alt = 'QR Code Pix do pedido';
    image.width = size;
    image.height = size;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    container.textContent = '';
    container.append(image);
    return { ok: true, crcValid: validation.crcValid };
  } catch (error) {
    container.classList.add('error');
    container.textContent = 'Nao foi possivel gerar o QR Code. Use o Pix copia e cola abaixo.';
    return { ok: false, reason: error?.message || 'PIX_QR_ERROR' };
  }
};
