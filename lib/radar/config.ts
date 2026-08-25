/**
 * Radar de herdeiros — interruptor do ADMIN, por env (só servidor).
 *
 * `RADAR_ATIVO=1` liga a oferta "Pedir análise de advogados" na área
 * pública — e é a ÚNICA condição.
 *
 * Até a retirada do link de confirmação por e-mail, o Radar também exigia
 * `RESEND_API_KEY`: sem e-mail ninguém conseguia publicar, então oferecer o
 * recurso seria mentira. Hoje o consentimento é o aceite na tela e a
 * publicação é imediata; o e-mail ficou OPCIONAL, só para avisos, e cada
 * envio já é env-gated por conta própria (`emailHabilitado()`).
 */

export function radarAtivo(): boolean {
  return process.env.RADAR_ATIVO === '1';
}
