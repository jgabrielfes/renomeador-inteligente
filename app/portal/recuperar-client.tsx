'use client';

/**
 * "Perdi o link do meu convite" — o herdeiro informa o e-mail que usou no
 * portal e recebe o link de volta. Resposta sempre neutra (sem confirmar se
 * o e-mail existe). Sem o e-mail transacional no deploy, a página orienta a
 * pedir o link ao advogado.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import '../(private)/sucessorista/sucessorista.css';

const esquema = z.object({
  email: z.string().trim().min(1, 'Informe o seu e-mail.').pipe(z.email('E-mail inválido.')),
});
type Dados = z.infer<typeof esquema>;

export default function RecuperarLink({ emailAtivo }: { emailAtivo: boolean }) {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({ resolver: zodResolver(esquema), defaultValues: { email: '' } });

  const enviar = async (dados: Dados) => {
    const r = await fetch('/api/portal/recuperar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: dados.email }),
    });
    const corpo = (await r.json().catch(() => null)) as { mensagem?: string; erro?: string } | null;
    setMensagem(
      corpo?.mensagem ??
        corpo?.erro ??
        'Se este e-mail estiver em algum convite, o link chega na caixa de entrada em instantes.',
    );
  };

  return (
    <div className="sucessorista">
      <main className="folha" style={{ maxWidth: 640, margin: '0 auto' }}>
        <span className="eyebrow">Acompanhamento do inventário</span>
        <h1>Perdeu o link do seu convite?</h1>
        {!emailAtivo ? (
          <div className="nota">
            <p>
              Peça o link diretamente ao advogado que conduz o inventário — ele gera e
              reenvia o seu acesso em segundos. O link é pessoal: não use o de outro
              herdeiro.
            </p>
          </div>
        ) : (
          <>
            <p className="subtitulo">
              Informe o e-mail que você usou no portal (nos seus dados ou nos avisos). Se
              ele estiver em algum convite, o link de acesso chega por e-mail.
            </p>
            <form noValidate onSubmit={handleSubmit(enviar)}>
              <label className="campo" style={{ maxWidth: 360 }}>
                Seu e-mail
                <input type="text" inputMode="email" aria-invalid={!!errors.email} {...register('email')} />
                {errors.email?.message && <span className="erro-campo">{errors.email.message}</span>}
              </label>
              <div style={{ marginTop: 12 }}>
                <button className="acao" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Enviando…' : 'Enviar meu link'}
                </button>
              </div>
            </form>
            {mensagem && (
              <div className="nota registro" style={{ marginTop: 14 }}>
                <p>{mensagem}</p>
              </div>
            )}
            <p className="fund" style={{ marginTop: 18 }}>
              Não recebeu? Confira o lixo eletrônico — ou peça um novo link ao advogado
              responsável.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
