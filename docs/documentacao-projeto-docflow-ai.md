# Documentação do Projeto — Assistente Inteligente de Documentos

## 1. Visão Geral

### Nome provisório

**DocFlow AI**

> Nome provisório. Pode ser alterado posteriormente.

### Descrição

Sistema inteligente para organização, classificação e análise de documentos utilizados por cartórios, escritórios jurídicos e profissionais que trabalham diariamente com grandes volumes de arquivos.

O sistema deverá utilizar Inteligência Artificial para identificar o conteúdo dos documentos, sugerir nomes padronizados, organizar arquivos em pastas e, futuramente, extrair informações, identificar documentos ausentes e apontar inconsistências.

### Problema

Profissionais que trabalham com documentação recebem arquivos de diversas fontes:

- WhatsApp
- E-mail
- Google Drive
- Scanner
- Sistemas internos
- Uploads de clientes
- Pastas compartilhadas

Esses arquivos frequentemente possuem nomes pouco úteis:

```text
IMG_1234.pdf
documento.pdf
scan0001.pdf
WhatsApp Image 2026-08-07 at 14.32.11.jpeg
novo documento.pdf
```

Isso gera trabalho manual para:

- identificar o tipo do documento;
- renomear arquivos;
- separar documentos;
- criar pastas;
- localizar documentos posteriormente;
- verificar se todos os documentos necessários foram enviados.

O objetivo do projeto é automatizar esse processo.

---

# 2. Objetivo do MVP

O primeiro MVP deverá resolver uma única dor de forma extremamente eficiente:

> **Receber uma coleção de documentos e organizá-los automaticamente.**

O usuário deverá conseguir enviar uma pasta ou vários arquivos e receber como resultado uma estrutura organizada.

### Exemplo

Entrada:

```text
documentos/
├── IMG_1234.jpg
├── scan001.pdf
├── documento.pdf
├── WhatsApp Image 2026.pdf
├── scan002.pdf
└── arquivo.pdf
```

Saída:

```text
João da Silva/
├── Documentos Pessoais/
│   ├── RG - João da Silva.pdf
│   ├── CPF - João da Silva.pdf
│   └── CNH - João da Silva.pdf
│
├── Imóvel/
│   ├── Matrícula - 123456.pdf
│   └── IPTU - 2026.pdf
│
└── Outros/
    └── Documento.pdf
```

---

# 3. Público-alvo

## Público inicial

O MVP será direcionado principalmente para:

- Cartórios
- Escritórios jurídicos
- Escritórios de advocacia
- Correspondentes jurídicos
- Imobiliárias
- Escritórios de contabilidade
- Profissionais que trabalham com documentação

## Persona principal

### Escrevente

Profissional que recebe diariamente diversos documentos e precisa:

1. Identificar os documentos.
2. Renomeá-los.
3. Organizá-los.
4. Conferir informações.
5. Localizá-los posteriormente.

O sistema deverá reduzir principalmente o trabalho operacional dessas tarefas.

---

# 4. Proposta de valor

O produto deverá permitir que o usuário transforme:

```text
100 arquivos desorganizados
```

em:

```text
1 dossiê organizado
```

com o mínimo possível de intervenção manual.

### Proposta

> **Jogue os documentos. A IA organiza.**

---

# 5. Escopo do MVP

## 5.1 Upload de documentos

O usuário deverá conseguir:

- selecionar múltiplos arquivos;
- arrastar arquivos para a aplicação;
- enviar PDFs;
- enviar imagens;
- visualizar o progresso do processamento.

### Formatos iniciais

```text
PDF
PNG
JPG
JPEG
WEBP
```

Formatos adicionais poderão ser adicionados posteriormente.

---

# 5.2 Processamento dos documentos

Cada documento deverá passar por um pipeline.

```text
Upload
   ↓
Armazenamento temporário
   ↓
Extração de texto
   ↓
OCR (quando necessário)
   ↓
Classificação
   ↓
Extração de informações
   ↓
Geração do nome
   ↓
Sugestão de categoria
   ↓
Resultado
```

---

# 5.3 Classificação

A IA deverá identificar o tipo do documento.

Exemplos:

```text
RG
CPF
CNH
Certidão de nascimento
Certidão de casamento
Certidão de óbito
Matrícula de imóvel
IPTU
Escritura
Procuração
Contrato
Comprovante de residência
Documento bancário
```

O sistema deverá permitir que novos tipos sejam adicionados futuramente.

---

# 5.4 Renomeação automática

A IA deverá sugerir um nome padronizado.

### Exemplo

Entrada:

```text
IMG_1234.pdf
```

Resultado:

```text
RG - João da Silva.pdf
```

Outro exemplo:

```text
scan00012.pdf
```

Resultado:

```text
Matrícula - 123456.pdf
```

### Regras

Os nomes deverão:

- ser claros;
- ser consistentes;
- evitar caracteres inválidos;
- evitar nomes excessivamente longos;
- manter informações relevantes;
- seguir um padrão configurável.

---

# 5.5 Organização por categorias

O sistema deverá sugerir uma categoria para cada documento.

Exemplo:

```text
Documentos Pessoais
Imóveis
Financeiro
Societário
Contratos
Certidões
Processo
Outros
```

A estrutura deverá ser configurável futuramente.

---

# 5.6 Revisão humana

A IA não deverá obrigatoriamente executar todas as alterações automaticamente.

O usuário deverá visualizar o resultado antes da confirmação.

### Exemplo

| Arquivo original | Tipo identificado | Novo nome | Confiança |
|---|---|---|---|
| IMG_123.pdf | RG | RG - João Silva.pdf | 98% |
| scan01.pdf | Matrícula | Matrícula - 123456.pdf | 95% |
| documento.pdf | Contrato | Contrato.pdf | 72% |

O usuário poderá:

- aceitar;
- editar;
- rejeitar;
- processar novamente.

---

# 5.7 Exportação

Após a confirmação, o sistema deverá permitir:

### Download

Baixar um ZIP contendo a estrutura organizada.

Exemplo:

```text
processo-joao-silva.zip
```

### Estrutura

```text
processo-joao-silva/
├── Documentos Pessoais/
├── Imóvel/
├── Certidões/
└── Outros/
```

---

# 6. Funcionalidades futuras

As funcionalidades abaixo não fazem parte obrigatoriamente do primeiro MVP.

## 6.1 Extração estruturada

Extrair informações relevantes.

Exemplo:

```json
{
  "tipo": "RG",
  "nome": "João da Silva",
  "cpf": "000.000.000-00",
  "rg": "00.000.000-0",
  "data_nascimento": "01/01/1990"
}
```

---

## 6.2 Checklist inteligente

O sistema deverá entender o tipo de procedimento e verificar quais documentos são necessários.

Exemplo:

```text
Procedimento:
Compra e Venda de Imóvel

Documentos:

✓ RG
✓ CPF
✓ Certidão de casamento
✓ Matrícula
✓ IPTU

⚠ ITBI não encontrado
⚠ Certidão negativa não encontrada
```

---

## 6.3 Detecção de inconsistências

Comparar informações presentes em diferentes documentos.

Exemplo:

```text
RG:
João da Silva

CPF:
João da Silva

Matrícula:
João Carlos da Silva

⚠ Possível divergência de nome.
```

---

## 6.4 Validação de documentos

Detectar situações como:

- documento ilegível;
- documento incompleto;
- documento vencido;
- documento duplicado;
- baixa confiança no OCR;
- informações conflitantes.

---

## 6.5 Pesquisa inteligente

Permitir pesquisas sem depender do nome do arquivo.

Exemplo:

```text
"documentos de João"
```

Resultado:

```text
RG
CPF
CNH
Procuração
Matrícula
Escritura
```

---

## 6.6 Chat com documentos

Permitir perguntas sobre os documentos processados.

Exemplo:

```text
Qual é o número da matrícula?

Quem são os proprietários?

Qual a área do imóvel?

Existe algum ônus?

Quais documentos estão faltando?
```

---

# 7. Arquitetura inicial

A arquitetura inicial deverá priorizar simplicidade e baixo custo.

```text
┌─────────────────────┐
│      Frontend       │
│      Next.js        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│       Backend       │
│       NestJS        │
└──────────┬──────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐   ┌─────────────┐
│Postgres │   │ Object      │
│         │   │ Storage     │
└─────────┘   └─────────────┘
                  │
                  ▼
             ┌─────────┐
             │   IA    │
             │ / OCR   │
             └─────────┘
```

---

# 8. Stack tecnológica

## Frontend

Sugestão:

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

Responsabilidades:

- autenticação;
- upload;
- dashboard;
- visualização dos documentos;
- revisão dos resultados;
- configuração.

---

## Backend

Sugestão:

```text
NestJS
Node.js
TypeScript
```

Responsabilidades:

- autenticação;
- gerenciamento de usuários;
- gerenciamento dos documentos;
- processamento;
- integração com IA;
- filas;
- regras de negócio.

---

## Banco de dados

Sugestão:

```text
PostgreSQL
```

O banco deverá armazenar:

- usuários;
- organizações;
- projetos;
- documentos;
- classificações;
- resultados da IA;
- configurações;
- histórico de processamento.

Os arquivos não deverão ser armazenados diretamente no PostgreSQL.

---

## Storage

Utilizar object storage.

Exemplos:

```text
AWS S3
Cloudflare R2
Supabase Storage
```

Estrutura sugerida:

```text
/{organizationId}/{projectId}/{documentId}/original
```

---

# 9. Modelo de dados inicial

## User

```text
User
├── id
├── name
├── email
├── passwordHash
├── createdAt
└── updatedAt
```

---

## Organization

Permite futuramente atender cartórios e empresas.

```text
Organization
├── id
├── name
├── createdAt
└── updatedAt
```

---

## Membership

Relaciona usuários às organizações.

```text
Membership
├── id
├── userId
├── organizationId
└── role
```

Roles:

```text
OWNER
ADMIN
MEMBER
```

---

## Project

Representa um conjunto de documentos.

```text
Project
├── id
├── organizationId
├── name
├── status
├── createdAt
└── updatedAt
```

Exemplo:

```text
Projeto:
Compra e Venda - João da Silva
```

---

## Document

```text
Document
├── id
├── projectId
├── originalName
├── generatedName
├── mimeType
├── size
├── storageKey
├── status
├── category
├── confidence
├── createdAt
└── updatedAt
```

Status:

```text
UPLOADED
PROCESSING
PROCESSED
REVIEW
APPROVED
FAILED
```

---

## DocumentExtraction

Armazena as informações extraídas pela IA.

```text
DocumentExtraction
├── id
├── documentId
├── type
├── data
├── confidence
├── model
└── createdAt
```

O campo `data` poderá ser JSON.

---

# 10. Pipeline de IA

Cada documento deverá passar por etapas independentes.

```text
Document
    │
    ▼
Text Extraction
    │
    ├── Texto disponível
    │
    └── Sem texto
            │
            ▼
           OCR
            │
            ▼
       Classification
            │
            ▼
     Data Extraction
            │
            ▼
     Name Generation
            │
            ▼
       Validation
            │
            ▼
          Review
```

---

# 11. Classificação por IA

A IA deverá retornar uma estrutura previsível.

Exemplo:

```json
{
  "documentType": "RG",
  "category": "DOCUMENTOS_PESSOAIS",
  "confidence": 0.98,
  "suggestedName": "RG - João da Silva.pdf"
}
```

Não deverá ser permitido que o backend dependa de texto livre para tomar decisões críticas.

Sempre que possível, utilizar:

- JSON Schema;
- enums;
- validação;
- structured output.

---

# 12. Controle de confiança

Cada resultado deverá possuir uma confiança.

Exemplo:

```text
0.95 - 1.00
Alta confiança

0.80 - 0.94
Média confiança

0.00 - 0.79
Baixa confiança
```

Documentos com baixa confiança deverão ser enviados para revisão manual.

Exemplo:

```text
⚠ A IA não conseguiu identificar este documento com segurança.

Confiança: 63%

Sugestão:
Certidão

[Editar] [Aceitar] [Reprocessar]
```

---

# 13. Processamento assíncrono

O processamento de documentos não deverá bloquear a requisição HTTP.

Fluxo:

```text
Upload
  ↓
Criar Document
  ↓
Adicionar Job
  ↓
Retornar resposta
  ↓
Worker processa
  ↓
Atualiza Document
  ↓
Frontend recebe atualização
```

Tecnologias possíveis:

```text
Redis
BullMQ
```

---

# 14. Segurança

O sistema trabalhará com documentos potencialmente sensíveis.

Portanto, segurança deverá ser considerada desde o MVP.

### Requisitos

- HTTPS obrigatório;
- autenticação;
- autorização por organização;
- isolamento dos arquivos;
- URLs assinadas para download;
- criptografia em trânsito;
- controle de acesso;
- logs;
- expiração de arquivos temporários;
- proteção contra upload malicioso.

---

# 15. LGPD

O sistema poderá processar dados pessoais e potencialmente dados sensíveis.

Deverá existir uma estratégia para:

- minimização de dados;
- controle de acesso;
- exclusão de documentos;
- retenção configurável;
- auditoria;
- tratamento de solicitações de exclusão;
- transparência sobre processamento por IA.

A implementação jurídica da LGPD deverá ser validada posteriormente com profissional especializado.

---

# 16. Auditoria

Todas as ações importantes deverão poder ser registradas.

Exemplo:

```text
2026-08-07 14:32
João aprovou documento.

2026-08-07 14:31
IA classificou documento como RG.

2026-08-07 14:30
Documento enviado.
```

Modelo:

```text
AuditLog
├── id
├── organizationId
├── userId
├── action
├── entity
├── entityId
├── metadata
└── createdAt
```

---

# 17. Interface inicial

## Dashboard

Mostrar:

```text
Documentos processados
Documentos pendentes
Documentos com erro
Processamentos recentes
```

---

## Novo projeto

```text
Nome do projeto

[________________________]

[Selecionar documentos]

        ou

Arraste os documentos aqui
```

---

## Processamento

Mostrar progresso:

```text
Processando documentos...

████████████████░░░░ 80%

80 de 100 documentos
```

---

## Revisão

Tabela:

```text
┌────────────────────┬──────────────┬──────────────────────────┬──────────┐
│ Documento           │ Tipo         │ Nome sugerido            │ Confiança│
├────────────────────┼──────────────┼──────────────────────────┼──────────┤
│ IMG_123.pdf         │ RG           │ RG - João Silva.pdf      │ 98%      │
│ scan01.pdf          │ Matrícula    │ Matrícula - 123456.pdf   │ 95%      │
│ documento.pdf       │ Contrato     │ Contrato.pdf             │ 71%      │
└────────────────────┴──────────────┴──────────────────────────┴──────────┘
```

Ações:

```text
[Editar] [Aprovar] [Reprocessar]
```

---

# 18. API inicial

## Authentication

```http
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
```

---

## Projects

```http
GET    /projects
POST   /projects
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id
```

---

## Documents

```http
POST   /projects/:id/documents
GET    /projects/:id/documents
GET    /documents/:id
PATCH  /documents/:id
DELETE /documents/:id
POST   /documents/:id/process
POST   /documents/:id/reprocess
POST   /documents/:id/approve
```

---

# 19. Estados do processamento

```text
UPLOADED
    ↓
QUEUED
    ↓
EXTRACTING_TEXT
    ↓
OCR
    ↓
CLASSIFYING
    ↓
EXTRACTING_DATA
    ↓
GENERATING_NAME
    ↓
COMPLETED
    ↓
REVIEW
    ↓
APPROVED
```

Em caso de erro:

```text
PROCESSING
    ↓
FAILED
```

---

# 20. Estratégia de custos

O processamento de IA deverá ser otimizado.

Não utilizar um modelo caro para todas as operações.

Possível estratégia:

```text
Documento
   ↓
Existe texto?
   ├── Sim → Classificação
   │
   └── Não → OCR
                ↓
            Classificação
```

Depois:

```text
Documento simples
    ↓
Modelo mais barato
```

Documento complexo:

```text
Documento complexo
    ↓
Modelo mais poderoso
```

O objetivo é manter o custo por documento baixo.

---

# 21. Métricas do MVP

### Precisão

```text
% de documentos corretamente classificados
```

### Precisão do nome

```text
% de nomes aceitos sem alteração
```

### Tempo

```text
Tempo médio por documento
```

### Intervenção humana

```text
% de documentos que precisam de edição
```

### Custo

```text
Custo médio de IA por documento
```

---

# 22. Critérios de sucesso

O MVP será considerado bem-sucedido quando conseguir:

- processar múltiplos documentos;
- identificar corretamente os principais tipos de documentos;
- gerar nomes úteis;
- organizar documentos em categorias;
- permitir revisão humana;
- exportar os documentos organizados;
- manter os arquivos seguros;
- processar documentos de forma assíncrona.

Meta inicial:

```text
≥ 90% de classificação correta
≥ 80% dos nomes aceitos sem alteração
```

Essas metas deverão ser ajustadas após testes com documentos reais.

---

# 23. Roadmap

## Fase 1 — MVP

```text
[ ] Autenticação
[ ] Organizações
[ ] Projetos
[ ] Upload múltiplo
[ ] Storage
[ ] OCR
[ ] Classificação
[ ] Renomeação
[ ] Categorização
[ ] Tela de revisão
[ ] Exportação ZIP
[ ] Logs básicos
```

---

## Fase 2 — Inteligência

```text
[ ] Extração estruturada
[ ] Detecção de duplicidade
[ ] Detecção de inconsistências
[ ] Validação de documentos
[ ] Checklists
[ ] Templates de organização
```

---

## Fase 3 — Copiloto

```text
[ ] Busca semântica
[ ] Chat com documentos
[ ] Perguntas sobre processos
[ ] Resumos
[ ] Comparação de documentos
[ ] Geração de relatórios
```

---

## Fase 4 — Integrações

```text
[ ] Google Drive
[ ] OneDrive
[ ] Dropbox
[ ] E-mail
[ ] WhatsApp
[ ] Sistemas de cartório
[ ] APIs externas
```

---

# 24. Diferencial competitivo

O produto não deverá competir apenas como ferramenta de OCR.

O diferencial deverá ser:

> **Entender o contexto documental e automatizar o trabalho operacional.**

Exemplo:

Uma ferramenta comum identifica:

```text
"João da Silva"
```

O produto deverá entender:

```text
Este é um RG de João da Silva.

Ele pertence à categoria
Documentos Pessoais.

Este documento pode ser utilizado
no processo de Compra e Venda.

O CPF encontrado neste documento
é compatível com o CPF encontrado
em outro documento.
```

A evolução natural é transformar o produto em um:

> **Copiloto de documentação para profissionais jurídicos e cartorários.**

---

# 25. Princípios de desenvolvimento

## Simplicidade

O MVP deverá possuir poucas funcionalidades, mas executá-las muito bem.

## Human-in-the-loop

A IA deverá sugerir antes de executar operações potencialmente destrutivas.

## Rastreabilidade

Toda alteração importante deverá ser auditável.

## Segurança

Documentos deverão ser tratados como dados sensíveis desde o primeiro dia.

## Escalabilidade

A arquitetura deverá permitir adicionar novos tipos de documentos e fluxos sem reescrever o sistema.

## IA como componente

A aplicação não deverá depender de um único modelo de IA.

O provedor/modelo deverá poder ser substituído.

---

# 26. Primeira versão recomendada

A primeira versão deverá possuir apenas:

```text
Login
  ↓
Dashboard
  ↓
Novo projeto
  ↓
Upload de documentos
  ↓
Processamento
  ↓
Classificação por IA
  ↓
Sugestão de nome
  ↓
Sugestão de categoria
  ↓
Revisão
  ↓
Aprovação
  ↓
Download ZIP
```

Não implementar inicialmente:

```text
Chat
Checklist complexo
Integrações
WhatsApp
Busca semântica
Automação jurídica
Validações avançadas
```

Essas funcionalidades deverão ser adicionadas somente depois de validar que o núcleo do produto realmente economiza tempo.

---

# 27. Primeiro caso de uso

### Cenário

Um escrevente recebe 50 documentos de um cliente.

### Antes

```text
Receber arquivos
      ↓
Abrir arquivo
      ↓
Identificar documento
      ↓
Renomear
      ↓
Criar pasta
      ↓
Mover arquivo
      ↓
Repetir 50 vezes
```

### Depois

```text
Receber arquivos
      ↓
Arrastar para o sistema
      ↓
Processamento automático
      ↓
Revisar sugestões
      ↓
Aprovar
      ↓
Baixar dossiê organizado
```

---

# 28. Objetivo final do produto

O objetivo não é simplesmente organizar arquivos.

O objetivo é transformar:

```text
DOCUMENTOS
```

em:

```text
INFORMAÇÃO ESTRUTURADA
```

E posteriormente transformar:

```text
INFORMAÇÃO ESTRUTURADA
```

em:

```text
AUTOMAÇÃO DO TRABALHO
```

A visão de longo prazo é criar uma plataforma capaz de compreender documentos, processos e fluxos de trabalho, reduzindo significativamente as tarefas manuais de profissionais que trabalham com documentação.
