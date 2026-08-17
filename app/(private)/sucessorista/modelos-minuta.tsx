/**
 * MEUS MODELOS DE MINUTA — biblioteca de padrões do(a) profissional.
 *
 * Em vez de anexar o modelo a cada geração, o padrão fica CADASTRADO
 * previamente (nome, categoria, texto extraído do .docx/.pdf/.txt) e é
 * escolhido num clique — cards com interação de hover, contagem de usos,
 * visualizar, editar e excluir, no desenho de uma biblioteca de minutas.
 *
 * Privacidade: o arquivo do modelo é lido NO NAVEGADOR e só o TEXTO fica
 * guardado (localStorage deste navegador); na geração, o texto segue pela
 * rota interna de redação. Modelos antigos do anexo avulso (chaves
 * sucessorista-modelo-peticao/-escritura) são migrados automaticamente.
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

export type TipoModeloMinuta = 'PETICAO' | 'ESCRITURA';

export interface ModeloMinuta {
  id: string;
  nome: string;
  tipo: TipoModeloMinuta;
  descricao: string;
  /** Texto extraído do arquivo — é o que a redação segue. */
  texto: string;
  criadoEm: string;
  usos: number;
}

const CHAVE_MODELOS = 'sucessorista-modelos-minuta';
const chaveAtivo = (tipo: TipoModeloMinuta) => `sucessorista-modelo-ativo-${tipo.toLowerCase()}`;

const ROTULO_TIPO: Record<TipoModeloMinuta, string> = {
  PETICAO: 'Petição inicial',
  ESCRITURA: 'Escritura',
};

function lerModelos(): ModeloMinuta[] {
  try {
    const bruto = localStorage.getItem(CHAVE_MODELOS);
    if (!bruto) return [];
    const lista = JSON.parse(bruto) as ModeloMinuta[];
    return Array.isArray(lista) ? lista.filter((m) => m?.id && m?.nome && m?.texto) : [];
  } catch {
    return [];
  }
}

function gravarModelos(lista: ModeloMinuta[]): void {
  try {
    localStorage.setItem(CHAVE_MODELOS, JSON.stringify(lista));
  } catch {
    toast.error('Sem espaço no navegador para guardar o modelo.');
  }
}

/** Soma 1 uso ao modelo (chamado pelas views ao gerar com ele). */
export function registrarUsoModelo(id: string): void {
  const lista = lerModelos();
  const alvo = lista.find((m) => m.id === id);
  if (!alvo) return;
  alvo.usos += 1;
  gravarModelos(lista);
}

/** Migra o anexo avulso antigo (um modelo por chave) para a biblioteca. */
function migrarLegado(lista: ModeloMinuta[]): ModeloMinuta[] {
  const migrar = (chave: string, tipo: TipoModeloMinuta): ModeloMinuta | null => {
    try {
      const bruto = localStorage.getItem(chave);
      if (!bruto) return null;
      const salvo = JSON.parse(bruto) as { nome?: string; texto?: string };
      localStorage.removeItem(chave);
      if (!salvo?.nome || !salvo?.texto) return null;
      const modelo: ModeloMinuta = {
        id: `mod-${crypto.randomUUID().slice(0, 8)}`,
        nome: salvo.nome.replace(/\.(docx|pdf|txt)$/i, ''),
        tipo,
        descricao: 'Migrado do anexo avulso',
        texto: salvo.texto,
        criadoEm: new Date().toISOString(),
        usos: 0,
      };
      try {
        localStorage.setItem(chaveAtivo(tipo), modelo.id);
      } catch {
        // modo restrito
      }
      return modelo;
    } catch {
      return null;
    }
  };
  const novos = [
    migrar('sucessorista-modelo-peticao', 'PETICAO'),
    migrar('sucessorista-modelo-escritura', 'ESCRITURA'),
  ].filter((m): m is ModeloMinuta => m !== null);
  return novos.length > 0 ? [...lista, ...novos] : lista;
}

async function extrairTexto(file: File): Promise<string | null> {
  let texto = '';
  if (/\.docx$/i.test(file.name)) {
    const { extrairTextoOffice } = await import('@/lib/office-texto');
    texto = await extrairTextoOffice(file);
  } else if (/\.txt$/i.test(file.name)) {
    texto = await file.text();
  } else if (/\.pdf$/i.test(file.name)) {
    const { readDocument } = await import('@/lib/ocr');
    texto = await readDocument(file);
  } else {
    toast.error('Modelo em .docx, .pdf ou .txt.');
    return null;
  }
  texto = texto.trim().slice(0, 40_000);
  if (texto.length < 200) {
    toast.warning('O modelo ficou com pouco texto legível — a redação pode não conseguir segui-lo.');
  }
  return texto;
}

/**
 * O bloco das views de minutas: mostra os modelos do tipo em CARDS (hover,
 * usos, em uso), com cadastrar/visualizar/editar/excluir — o modelo ATIVO é
 * o que a próxima geração segue; "Padrão do sistema" desmarca.
 */
export function MeusModelosMinuta({
  tipo,
  dica,
  onAtivo,
}: {
  tipo: TipoModeloMinuta;
  dica: string;
  /** Informa o pai qual modelo está ativo (null = padrão do sistema). */
  onAtivo: (m: ModeloMinuta | null) => void;
}) {
  const [modelos, setModelos] = useState<ModeloMinuta[]>([]);
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [editando, setEditando] = useState<ModeloMinuta | null>(null);
  const [visualizando, setVisualizando] = useState<ModeloMinuta | null>(null);
  const [excluindo, setExcluindo] = useState<ModeloMinuta | null>(null);
  const onAtivoRef = useRef(onAtivo);
  useEffect(() => {
    onAtivoRef.current = onAtivo;
  });

  // Carga inicial (efeito diferido — hidratação) + migração do anexo avulso.
  useEffect(() => {
    const t = setTimeout(() => {
      const lista = migrarLegado(lerModelos());
      gravarModelos(lista);
      setModelos(lista);
      try {
        const id = localStorage.getItem(chaveAtivo(tipo));
        const ativo = lista.find((m) => m.id === id && m.tipo === tipo) ?? null;
        setAtivoId(ativo?.id ?? null);
        onAtivoRef.current(ativo);
      } catch {
        // modo restrito
      }
    }, 0);
    return () => clearTimeout(t);
  }, [tipo]);

  const doTipo = modelos.filter((m) => m.tipo === tipo);

  const atualizar = (lista: ModeloMinuta[]) => {
    setModelos(lista);
    gravarModelos(lista);
  };

  const ativar = (m: ModeloMinuta | null) => {
    setAtivoId(m?.id ?? null);
    onAtivoRef.current(m);
    try {
      if (m) localStorage.setItem(chaveAtivo(tipo), m.id);
      else localStorage.removeItem(chaveAtivo(tipo));
    } catch {
      // modo restrito
    }
  };

  const excluir = (m: ModeloMinuta) => {
    atualizar(modelos.filter((x) => x.id !== m.id));
    if (ativoId === m.id) ativar(null);
    setExcluindo(null);
    toast.success(`Modelo "${m.nome}" excluído.`);
  };

  return (
    <div className="nota" style={{ marginTop: 12 }}>
      <span className="eyebrow">Meus modelos de minuta — {ROTULO_TIPO[tipo].toLowerCase()}</span>
      <p style={{ margin: '4px 0 10px' }}>{dica}</p>

      <div className="modelos-grade">
        {/* Padrão do sistema: sempre disponível — é o card "sem modelo". */}
        <button
          type="button"
          className={`modelo-cartao${ativoId === null ? ' ativo' : ''}`}
          onClick={() => ativar(null)}
        >
          <h4>Padrão do sistema</h4>
          <p>{tipo === 'ESCRITURA' ? 'Modelo do balcão embutido (determinístico — não depende de IA).' : 'Redação padrão do sistema, com fallback local.'}</p>
          {ativoId === null && <span className="em-uso">em uso</span>}
        </button>

        {doTipo.map((m) => (
          <div
            key={m.id}
            role="button"
            tabIndex={0}
            className={`modelo-cartao${ativoId === m.id ? ' ativo' : ''}`}
            onClick={() => ativar(m)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') ativar(m);
            }}
          >
            <h4>{m.nome}</h4>
            <p>{m.descricao || ROTULO_TIPO[m.tipo]}</p>
            <span className="fund num">{m.usos} uso(s)</span>
            {ativoId === m.id && <span className="em-uso">em uso</span>}
            <span className="acoes-modelo">
              <button
                type="button"
                title="Visualizar"
                aria-label={`Visualizar ${m.nome}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setVisualizando(m);
                }}
              >
                👁
              </button>
              <button
                type="button"
                title="Editar"
                aria-label={`Editar ${m.nome}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditando(m);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                title="Excluir"
                aria-label={`Excluir ${m.nome}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExcluindo(m);
                }}
              >
                🗑
              </button>
            </span>
          </div>
        ))}

        <button type="button" className="modelo-cartao novo" onClick={() => setCadastrando(true)}>
          <h4>+ Novo modelo</h4>
          <p>Cadastre o seu padrão (.docx, .pdf ou .txt) uma única vez.</p>
        </button>
      </div>

      {/* cadastrar / editar */}
      <DialogModelo
        aberto={cadastrando || editando !== null}
        tipo={tipo}
        modelo={editando}
        onFechar={() => {
          setCadastrando(false);
          setEditando(null);
        }}
        onSalvar={(m) => {
          const existente = modelos.some((x) => x.id === m.id);
          const lista = existente
            ? modelos.map((x) => (x.id === m.id ? m : x))
            : [...modelos, m];
          atualizar(lista);
          ativar(m);
          setCadastrando(false);
          setEditando(null);
          toast.success(`Modelo "${m.nome}" ${existente ? 'atualizado' : 'cadastrado'} — em uso na próxima geração.`);
        }}
      />

      {/* visualizar */}
      <Dialog open={visualizando !== null} onOpenChange={(a) => !a && setVisualizando(null)}>
        <DialogContent className="flex max-h-[80vh] flex-col">
          <DialogHeader>
            <DialogTitle>{visualizando?.nome}</DialogTitle>
            <DialogDescription>
              {visualizando?.descricao || ROTULO_TIPO[tipo]} · {visualizando?.usos ?? 0} uso(s) —
              texto extraído que a redação segue.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1">
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{visualizando?.texto}</p>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* excluir (ação destrutiva pede confirmação) */}
      <Dialog open={excluindo !== null} onOpenChange={(a) => !a && setExcluindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir o modelo?</DialogTitle>
            <DialogDescription>
              “{excluindo?.nome}” sai da biblioteca deste navegador. A geração volta ao
              padrão do sistema se ele estiver em uso.
            </DialogDescription>
          </DialogHeader>
          <div className="escolha" style={{ justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => excluindo && excluir(excluindo)}>
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Dialog de cadastro/edição: nome + descrição + arquivo do padrão. */
function DialogModelo({
  aberto,
  tipo,
  modelo,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  tipo: TipoModeloMinuta;
  /** null = cadastro novo; preenchido = edição (trocar arquivo é opcional). */
  modelo: ModeloMinuta | null;
  onFechar: () => void;
  onSalvar: (m: ModeloMinuta) => void;
}) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [texto, setTexto] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reabre limpo (cadastro) ou preenchido (edição) a cada abertura.
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => {
      setNome(modelo?.nome ?? '');
      setDescricao(modelo?.descricao ?? '');
      setTexto(modelo?.texto ?? null);
      setNomeArquivo(null);
    }, 0);
    return () => clearTimeout(t);
  }, [aberto, modelo]);

  const carregar = async (file: File) => {
    setLendo(true);
    try {
      const extraido = await extrairTexto(file);
      if (extraido !== null) {
        setTexto(extraido);
        setNomeArquivo(file.name);
        if (!nome.trim()) setNome(file.name.replace(/\.(docx|pdf|txt)$/i, ''));
      }
    } catch {
      toast.error('Não foi possível ler o arquivo do modelo.');
    } finally {
      setLendo(false);
    }
  };

  const salvar = () => {
    if (!nome.trim()) {
      toast.error('Dê um nome ao modelo.');
      return;
    }
    if (!texto) {
      toast.error('Anexe o arquivo do seu padrão (.docx, .pdf ou .txt).');
      return;
    }
    onSalvar({
      id: modelo?.id ?? `mod-${crypto.randomUUID().slice(0, 8)}`,
      nome: nome.trim().slice(0, 80),
      tipo,
      descricao: descricao.trim().slice(0, 160),
      texto,
      criadoEm: modelo?.criadoEm ?? new Date().toISOString(),
      usos: modelo?.usos ?? 0,
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modelo ? 'Editar modelo' : 'Novo modelo de minuta'}</DialogTitle>
          <DialogDescription>
            {ROTULO_TIPO[tipo]} — o arquivo é lido aqui no navegador; só o texto extraído
            fica guardado e segue para a redação.
          </DialogDescription>
        </DialogHeader>

        <label className="campo">
          Nome do modelo
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="campo">
          <span>
            Descrição <span className="dica">— opcional</span>
          </span>
          <Textarea value={descricao} rows={2} onChange={(e) => setDescricao(e.target.value)} />
        </label>

        <div style={{ marginTop: 4 }}>
          <Button type="button" variant="outline" size="sm" loading={lendo} onClick={() => inputRef.current?.click()}>
            {texto ? 'Trocar o arquivo do padrão' : '+ Anexar o arquivo do padrão'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.pdf,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void carregar(f);
              e.target.value = '';
            }}
          />
          {texto && (
            <p className="fund" style={{ marginTop: 6 }}>
              {nomeArquivo ? `Arquivo lido: ${nomeArquivo}` : 'Texto do modelo carregado'} (
              {Math.round(texto.length / 1000)} mil caracteres).
            </p>
          )}
        </div>

        <div className="escolha" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={salvar}>{modelo ? 'Salvar alterações' : 'Cadastrar modelo'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
