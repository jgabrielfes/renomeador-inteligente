// /portal/privacidade — "Privacidade e LGPD" do Painel do Cliente, em
// linguagem simples: o que fica no servidor, por quanto tempo e como
// excluir. Página PÚBLICA e estática do site do Sucessorista, linkada do
// rodapé do portal do herdeiro.

import { requirePlataforma } from "@/lib/app";

import "../../(private)/sucessorista/sucessorista.css";

export const metadata = {
  title: "Privacidade e LGPD — acompanhamento do inventário",
};

export default async function PrivacidadePortalPage() {
  await requirePlataforma("SUCESSORISTA");
  return (
    <div className="sucessorista">
      <main className="folha" style={{ maxWidth: 720, margin: "0 auto" }}>
        <span className="eyebrow">Acompanhamento do inventário</span>
        <h1>Privacidade e proteção de dados</h1>
        <p className="subtitulo">
          Esta página explica, sem juridiquês, o que acontece com as informações que você
          envia pelo link do seu convite — e como apagá-las.
        </p>

        <h2>O que fica guardado no servidor</h2>
        <ul className="lista-privacidade">
          <li>
            <strong>O seu convite</strong>: seu nome, a lista de documentos pedidos e o
            andamento de cada um (enviado, aprovado, devolvido).
          </li>
          <li>
            <strong>Os dados que você preenche</strong> no formulário (CPF, endereço e
            afins) — eles vão direto para a folha de trabalho do advogado.
          </li>
          <li>
            <strong>Os arquivos que você envia</strong>: ficam guardados até o escritório
            baixá-los para o caso. Você mesmo pode apagar um envio seu enquanto o pedido
            não foi aprovado (botão &quot;apagar arquivo&quot;).
          </li>
          <li>
            <strong>O painel publicado</strong>: o recorte do caso que o advogado decidiu
            mostrar a você (fase, próximo passo, custos e, se liberado, o seu quinhão).
          </li>
          <li>
            <strong>O registro de comunicação</strong>: datas de convite, acessos, envios
            e avisos — a prova de que a família foi informada.
          </li>
          <li>
            <strong>O e-mail dos avisos</strong>, se você optar por recebê-los — com a
            preferência que você escolher (tudo, só fases ou nada).
          </li>
        </ul>

        <h2>O que NUNCA fica visível para você ou para terceiros</h2>
        <p>
          A folha de trabalho completa do advogado, as anotações internas do escritório e
          os honorários não entram no seu painel — por construção, não por configuração.
          Cada herdeiro vê somente o próprio recorte: seus documentos, seu quinhão, seus
          avisos. Os dados de um herdeiro nunca aparecem para outro.
        </p>

        <h2>Por quanto tempo e como excluir</h2>
        <ul className="lista-privacidade">
          <li>
            Tudo fica guardado <strong>enquanto o acompanhamento durar</strong>. Quando o
            advogado clica em &quot;Encerrar compartilhamento&quot;, o servidor apaga o
            painel, os convites, os arquivos enviados e o registro — de uma vez.
          </li>
          <li>
            O advogado também pode <strong>revogar só o seu link</strong> (o acesso morre
            na hora) ou gerar um novo se você o perdeu.
          </li>
          <li>
            Para corrigir ou excluir qualquer informação sua, <strong>fale com o
            advogado que conduz o inventário</strong> — é ele quem decide sobre os dados
            do caso.
          </li>
        </ul>

        <h2>Quem responde pelos seus dados (LGPD)</h2>
        <p>
          Nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018), o{" "}
          <strong>advogado responsável pelo inventário é o controlador</strong> dos dados
          — é ele quem decide o que coletar e para quê. A plataforma atua como{" "}
          <strong>operadora</strong>: guarda e transmite os dados por conta e ordem do
          escritório, sob a base legal da execução do contrato de prestação de serviços
          jurídicos e do legítimo interesse na condução do inventário. Os dados ficam em
          banco gerenciado com criptografia em repouso e não são usados para nenhuma
          outra finalidade — nem publicidade, nem venda, nem estatística com conteúdo.
        </p>

        <h2>Uma nota sobre os documentos</h2>
        <p>
          Quando você anexa um documento, a leitura que dá nome ao arquivo acontece{" "}
          <strong>no seu próprio navegador</strong> — o conteúdo só sai do seu aparelho
          para o servidor do acompanhamento, de onde o escritório o retira. Nenhum
          documento é enviado a serviços externos nesse trajeto.
        </p>

        <footer className="rodape-etico">
          Dúvidas sobre esta página ou sobre seus dados? Fale com o advogado responsável
          pelo seu inventário. Você pode constituir advogado(a) próprio(a) a qualquer
          momento.
        </footer>
      </main>
    </div>
  );
}
