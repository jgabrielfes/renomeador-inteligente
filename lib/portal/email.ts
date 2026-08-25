/**
 * E-mail transacional do Painel do Cliente — SÓ SERVIDOR, env-gated como o
 * login Google: sem `RESEND_API_KEY` o recurso NÃO EXISTE (nenhum aviso é
 * enviado, a UI nem oferece; o texto pronto de WhatsApp é o fallback que
 * sempre funciona). Envio pela API REST do Resend via fetch — nenhuma
 * dependência nova.
 *
 * Conteúdo dos e-mails: rótulos leigos e o LINK do portal do destinatário —
 * nunca valores do caso, nunca dados de outros herdeiros. Melhor-esforço:
 * falha de e-mail jamais derruba a ação que o originou.
 */

import { IDENTIDADE } from '@/lib/app';

export function emailHabilitado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Remetente. Configure EMAIL_FROM com um domínio VERIFICADO no Resend
 * (ex.: "LexCausa <avisos@lexcausa.com.br>") — sem domínio próprio o Resend
 * só entrega ao e-mail da PRÓPRIA conta, então a família não receberia nada.
 *
 * O NOME DE EXIBIÇÃO é o que a caixa de entrada mostra: sem ele o Gmail
 * escreve a parte local do endereço ("onboarding"). Por isso o padrão sai da
 * identidade da plataforma, e não de uma string presa a uma marca antiga.
 */
function remetente(): string {
  return process.env.EMAIL_FROM ?? `${IDENTIDADE.nome} <onboarding@resend.dev>`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Dispara UM e-mail (best-effort). O corpo é texto simples vestido de leve
 * com a identidade (papel/tinta) — nada de template pesado.
 */
export async function enviarEmailPortal({
  para,
  assunto,
  titulo,
  paragrafos,
  urlPortal,
  rotuloBotao = 'Abrir meu portal',
  rodape = 'Aviso automático do acompanhamento do inventário — não responda a este e-mail. Dúvidas, fale direto com o advogado responsável.',
}: {
  para: string;
  assunto: string;
  titulo: string;
  paragrafos: string[];
  /** Link do portal DO DESTINATÁRIO — vira o botão. */
  urlPortal?: string;
  /** Texto do botão (a área "Para famílias" usa outro rótulo). */
  rotuloBotao?: string;
  /** Rodapé do e-mail (a área pública não fala em "advogado responsável"). */
  rodape?: string;
}): Promise<boolean> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave || !/.+@.+\..+/.test(para)) return false;

  const corpo = paragrafos.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join('');
  const botao = urlPortal
    ? `<p style="margin:18px 0"><a href="${escapeHtml(urlPortal)}" style="background:#1a2320;color:#f6f4ee;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">${escapeHtml(rotuloBotao)}</a></p><p style="margin:0 0 12px;font-size:12px;color:#4a544f">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${escapeHtml(urlPortal)}</p>`
    : '';
  const html = `<div style="background:#f6f4ee;padding:28px 16px"><div style="max-width:560px;margin:0 auto;background:#fdfcf9;border:1px solid #ddd8ca;border-radius:12px;padding:26px 28px;font-family:Arial,Helvetica,sans-serif;color:#1a2320;font-size:15px;line-height:1.55"><h1 style="font-size:18px;margin:0 0 14px">${escapeHtml(titulo)}</h1>${corpo}${botao}<p style="margin:18px 0 0;padding-top:12px;border-top:1px solid #ddd8ca;font-size:12px;color:#4a544f">${escapeHtml(rodape)}</p></div></div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remetente(), to: [para], subject: assunto, html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
