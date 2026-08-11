'use client';

/**
 * Portal do herdeiro — a página que o advogado envia por link.
 * Sem login: o token do convite é a credencial. O herdeiro preenche um
 * formulário rápido de qualificação (isso costuma atrasar o processo) e
 * anexa os documentos — o motor LOCAL do renomeador roda aqui no navegador
 * e propõe o nome correto antes do envio; o conteúdo do arquivo não sai
 * da máquina (fronteira de dados do projeto).
 */

import { use, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import '../../(private)/sucessorista/sucessorista.css';
import { LupaPreview } from '../../(private)/sucessorista/preview';

/** Alias estrutural — compatível com o ChangeEvent de input file. */
type Ev = { target: { value: string; files?: FileList | null; checked?: boolean } };
import type { ConviteHerdeiro } from '@/lib/portal/store';

const ROTULO: Record<string, string> = {
  PENDENTE: 'Aguardando você',
  ENVIADO: 'Em revisão pelo advogado',
  APROVADO: 'Aprovado',
  REJEITADO: 'Precisa reenviar',
};

const esquemaQualificacao = z.object({
  cpf: z
    .string()
    .trim()
    .min(1, 'Informe seu CPF.')
    .regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'CPF inválido — use 000.000.000-00.'),
  rg: z.string().trim(),
  dataNascimento: z.string().min(1, 'Informe sua data de nascimento.'),
  profissao: z.string().trim().min(1, 'Informe sua profissão.'),
  estadoCivil: z.string().min(1, 'Informe seu estado civil.'),
  email: z.string().trim().min(1, 'Informe seu e-mail.').pipe(z.email('E-mail inválido.')),
  endereco: z.string().trim().min(1, 'Informe seu endereço (rua e número).'),
  complemento: z.string().trim(),
  bairro: z.string().trim(),
  cidade: z.string().trim().min(1, 'Informe a cidade.'),
  uf: z.string().trim().min(2, 'Informe o estado (UF).'),
  cep: z.string().trim().min(1, 'Informe o CEP.'),
});

type Qualificacao = z.infer<typeof esquemaQualificacao>;

export default function PortalHerdeiro({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [convite, setConvite] = useState<ConviteHerdeiro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState<string | null>(null);
  const [dicaQualidade, setDicaQualidade] = useState<string | null>(null);
  /** Arquivos anexados nesta visita, por documento — permitem a lupa local. */
  const [arquivos, setArquivos] = useState<Record<string, File>>({});
  const [preview, setPreview] = useState<File | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Convite não encontrado ou expirado.'))))
      .then(setConvite)
      .catch((e: Error) => setErro(e.message));
  }, [token]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Qualificacao>({
    resolver: zodResolver(esquemaQualificacao),
    defaultValues: {
      cpf: '', rg: '', dataNascimento: '', profissao: '', estadoCivil: '',
      email: '', endereco: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '',
    },
  });

  const enviarQualificacao = async (dados: Qualificacao) => {
    const r = await fetch(`/api/portal/${token}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ qualificacao: dados }),
    });
    if (r.ok) setConvite(await r.json());
  };

  /**
   * Envio de documento: o renomeador LOCAL lê o arquivo aqui no navegador
   * (OCR quando preciso), detecta o tipo e propõe o nome padronizado.
   * Só o NOME segue para o advogado — o arquivo não é transmitido.
   */
  const enviarDocumento = async (docId: string, file: File) => {
    setAnalisando(docId);
    setDicaQualidade(null);
    setArquivos((a) => ({ ...a, [docId]: file }));
    let nome = file.name;
    let tipo: string | undefined;
    try {
      const [{ readDocument }, { proposeName }] = await Promise.all([
        import('@/lib/ocr'),
        import('@/lib/renamer'),
      ]);
      const texto = await readDocument(file);
      if (texto.trim().length < 40) {
        setDicaQualidade(
          'O documento ficou pouco legível na leitura automática. Se for foto, tente de novo com boa iluminação, sem corte e sem inclinação — isso evita idas e vindas com o cartório.',
        );
      }
      const proposta = proposeName(file.name, texto);
      nome = proposta.name;
      tipo = proposta.docType !== 'Documento' ? proposta.docType : undefined;
    } catch {
      // Sem leitura local (formato não suportado etc.): segue com o nome original.
    }
    const r = await fetch(`/api/portal/${token}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docId, status: 'ENVIADO', nomeArquivo: nome, tipoDetectado: tipo }),
    });
    if (r.ok) setConvite(await r.json());
    setAnalisando(null);
  };

  if (erro) {
    return (
      <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto' }}>
        <h1>Link indisponível</h1>
        <div className="nota exigencia">
          <p>{erro} Peça um novo link ao advogado responsável.</p>
        </div>
      </main>
      </div>
    );
  }

  if (!convite) {
    return (
      <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto' }}>
        <p className="subtitulo">Abrindo seu convite…</p>
      </main>
      </div>
    );
  }

  const feitos = convite.documentos.filter((d) => d.status === 'APROVADO').length;
  const advogado = convite.nomeAdvogado || 'o advogado responsável';

  return (
    <div className="sucessorista">
    <main className="folha" style={{ margin: '0 auto' }}>
      <span className="eyebrow">Inventário de {convite.nomeFalecido}</span>
      <h1>Olá, {convite.nomeHerdeiro}</h1>
      <p className="subtitulo">
        Para o inventário andar, precisamos de duas coisas suas: os dados abaixo (2 minutos)
        e os documentos da lista. Nada aqui é público: só você e {advogado} veem esta página.
      </p>

      {/* ---------- 1. qualificação ---------- */}
      <h2>1. Seus dados</h2>
      {convite.qualificacao ? (
        <div className="nota registro">
          <span className="eyebrow">Recebido</span>
          <p>
            Seus dados foram enviados{convite.qualificacaoEnviadaEm ? ` em ${new Date(convite.qualificacaoEnviadaEm).toLocaleDateString('pt-BR')}` : ''}.
            Precisa corrigir algo? Preencha e envie de novo — a versão mais recente vale.
          </p>
        </div>
      ) : null}
      <form noValidate onSubmit={handleSubmit(enviarQualificacao)}>
        <div className="grade q-grid" style={{ marginTop: 8 }}>
          <Campo rotulo="CPF" erro={errors.cpf?.message}>
            <input type="text" inputMode="numeric" placeholder="000.000.000-00" aria-invalid={!!errors.cpf} {...register('cpf')} />
          </Campo>
          <Campo rotulo="RG (opcional)" erro={errors.rg?.message}>
            <input type="text" {...register('rg')} />
          </Campo>
          <Campo rotulo="Data de nascimento" erro={errors.dataNascimento?.message}>
            <input type="date" aria-invalid={!!errors.dataNascimento} {...register('dataNascimento')} />
          </Campo>
          <Campo rotulo="Profissão" erro={errors.profissao?.message}>
            <input type="text" aria-invalid={!!errors.profissao} {...register('profissao')} />
          </Campo>
          <Campo rotulo="Estado civil" erro={errors.estadoCivil?.message}>
            <select aria-invalid={!!errors.estadoCivil} {...register('estadoCivil')}>
              <option value="">Selecione…</option>
              <option>Solteiro(a)</option>
              <option>Casado(a)</option>
              <option>União estável</option>
              <option>Divorciado(a)</option>
              <option>Viúvo(a)</option>
            </select>
          </Campo>
          <Campo rotulo="E-mail" erro={errors.email?.message}>
            <input type="text" inputMode="email" placeholder="voce@exemplo.com" aria-invalid={!!errors.email} {...register('email')} />
          </Campo>
          <Campo rotulo="Endereço (rua e número)" erro={errors.endereco?.message}>
            <input type="text" aria-invalid={!!errors.endereco} {...register('endereco')} />
          </Campo>
          <Campo rotulo="Complemento (opcional)" erro={errors.complemento?.message}>
            <input type="text" {...register('complemento')} />
          </Campo>
          <Campo rotulo="Bairro (opcional)" erro={errors.bairro?.message}>
            <input type="text" {...register('bairro')} />
          </Campo>
          <Campo rotulo="Cidade" erro={errors.cidade?.message}>
            <input type="text" aria-invalid={!!errors.cidade} {...register('cidade')} />
          </Campo>
          <Campo rotulo="Estado (UF)" erro={errors.uf?.message}>
            <input type="text" placeholder="SP" maxLength={2} aria-invalid={!!errors.uf} {...register('uf')} />
          </Campo>
          <Campo rotulo="CEP" erro={errors.cep?.message}>
            <input type="text" inputMode="numeric" placeholder="00000-000" aria-invalid={!!errors.cep} {...register('cep')} />
          </Campo>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="acao" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : convite.qualificacao ? 'Reenviar meus dados' : 'Enviar meus dados'}
          </button>
        </div>
      </form>

      {/* ---------- 2. documentos ---------- */}
      <h2>2. Seus documentos</h2>
      <p className="progresso num">
        {feitos} de {convite.documentos.length} documentos aprovados
      </p>
      <p className="fund" style={{ marginBottom: 8 }}>
        Ao anexar, o documento é lido aqui no seu navegador e renomeado automaticamente no
        padrão do cartório. Prefira PDF ou foto nítida, inteira e sem sombra.
      </p>
      {dicaQualidade && <p className="mono-alerta">{dicaQualidade}</p>}

      <div className="check">
        {convite.documentos.map((d) => (
          <div className="check-item" key={d.id}>
            <span className="prio">{d.status === 'APROVADO' ? '✓' : '·'}</span>
            <div>
              <h4>{d.titulo}</h4>
              <p>{d.descricao}</p>
              <p className="fund">{analisando === d.id ? 'Lendo o documento…' : ROTULO[d.status]}</p>
              {d.status === 'REJEITADO' && d.observacaoAdvogado && (
                <p className="alerta">Advogado: {d.observacaoAdvogado}</p>
              )}
              {(d.status === 'PENDENTE' || d.status === 'REJEITADO') && (
                <label className="campo" style={{ marginTop: 8, maxWidth: 340 }}>
                  Enviar arquivo
                  <input
                    type="file"
                    disabled={analisando !== null}
                    onChange={(e: Ev) => {
                      const f = e.target.files?.[0];
                      if (f) void enviarDocumento(d.id, f);
                    }}
                  />
                </label>
              )}
              {d.nomeArquivo && d.status !== 'PENDENTE' && (
                <p className="fund">
                  Arquivo: {d.nomeArquivo}
                  {d.tipoDetectado ? ` · lido como ${d.tipoDetectado}` : ''}
                  {arquivos[d.id] && (
                    <button
                      type="button"
                      className="lupa"
                      title={`Pré-visualizar ${d.nomeArquivo}`}
                      aria-label={`Pré-visualizar ${d.nomeArquivo}`}
                      onClick={() => setPreview(arquivos[d.id])}
                    >
                      🔍
                    </button>
                  )}
                </p>
              )}
            </div>
            <span />
          </div>
        ))}
      </div>

      <p className="fund" style={{ marginTop: 24 }}>
        Dúvidas sobre algum documento? Fale direto com {advogado}.
      </p>

      <LupaPreview file={preview} onClose={() => setPreview(null)} />
    </main>
    </div>
  );
}

/** Campo do formulário com erro amigável, na identidade visual do módulo. */
function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="campo">
      {rotulo}
      {children}
      {erro && <span className="erro-campo">{erro}</span>}
    </label>
  );
}
