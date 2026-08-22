/**
 * Radar de herdeiros — interruptor do ADMIN, por env (só servidor).
 *
 * `RADAR_ATIVO=1` liga a oferta "Pedir análise de advogados" na área
 * pública. O desenho EXIGE e-mail confirmado para publicar, então o Radar
 * também depende de `RESEND_API_KEY` — sem e-mail, o recurso não existe
 * (nenhuma UI aparece), como os demais recursos env-gated do projeto.
 */

import { emailHabilitado } from '@/lib/portal/email';

export function radarAtivo(): boolean {
  return process.env.RADAR_ATIVO === '1' && emailHabilitado();
}
