# Praticidade de clientes no gerador — Design

**Data:** 2026-06-25
**Objetivo:** Reduzir o atrito diário ao escolher a empresa no gerador de relatório, atacando três dores: (1) achar a empresa numa lista longa, (2) ver o que já foi apurado para ela, (3) cadastrar/editar a empresa sem sair do gerador.

**Fora de escopo:** painel/drawer lateral; exibição de dados-chave dedicada (regime/ISS) ao selecionar — o chip de regime no resultado da busca já cobre o essencial.

## Arquitetura

Reaproveita o cadastro existente (`lib/storage.ts`, BrasilAPI) e o `useEffect` que já reabre competências salvas (`app/relatorio/page.tsx`). Duas peças novas e bem isoladas, mais um pequeno refactor de reuso.

### Componentes novos

1. **`components/ClienteModal.tsx`** — modal de cadastro/edição de cliente, extraído do que hoje está embutido em `app/clientes/page.tsx`.
   - **Props:** `{ cliente: Cliente; onClose: () => void; onSaved: (c: Cliente) => void }`.
   - **Faz:** renderiza os campos (CNPJ + botão "Buscar" via `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`, Razão social/Nome, E-mail, Telefone, Regime, Atividade, Anexo quando Simples, Município/UF), valida nome obrigatório, persiste via `saveCliente`, dá toast e chama `onSaved(clienteSalvo)`.
   - **Estado interno:** rascunho do cliente em edição e `busy` (consulta CNPJ). Não conhece nenhuma das telas — comunica só pelas props.

2. **`components/ClientePicker.tsx`** — combobox de seleção de empresa.
   - **Props:** `{ clientes: Cliente[]; value: string; onSelect: (id: string) => void; onNew: () => void; onEdit: (c: Cliente) => void }`.
   - **Faz:** campo de texto que mostra o nome do cliente selecionado (ou placeholder); ao focar/digitar abre um dropdown com os clientes filtrados por **nome ou CNPJ** (substring, case-insensitive, CNPJ comparado só por dígitos). Cada linha: nome + CNPJ formatado + chip de regime (`+ anexo` se Simples). Clicar numa linha → `onSelect(id)` e fecha. Rodapé fixo: **"+ Nova empresa"** → `onNew()`. Com `value` preenchido, um ícone **lápis** ao lado do campo → `onEdit(clienteSelecionado)`.
   - **Interação:** fecha ao clicar fora e com `Esc`; navegação básica ↑/↓/Enter; lista vazia → "Nenhum cliente — cadastre"; busca sem match → "Nenhuma empresa encontrada" + "+ Nova empresa".

### Refactor de reuso

- Mover `novoCliente()` (Cliente em branco com `uid()` e defaults) para `lib/storage.ts`, exportado. Hoje existe como `novo()` local em `app/clientes/page.tsx`.
- `app/clientes/page.tsx` passa a renderizar `<ClienteModal>` em vez do modal embutido (comportamento idêntico ao atual).

### Integração no gerador (`app/relatorio/page.tsx`)

- Substituir o `<select>` de Empresa (bloco atual nas linhas ~234–239) por `<ClientePicker clientes={clientes} value={clienteId} onSelect={selectCliente} onNew={...} onEdit={...} />`.
- Novo estado `clienteEdit: Cliente | undefined` (`undefined` = modal fechado). `onNew` → `setClienteEdit(novoCliente())`; `onEdit(c)` → `setClienteEdit(c)`. Renderizar `<ClienteModal cliente={clienteEdit} onClose={() => setClienteEdit(undefined)} onSaved={onClienteSaved}>` quando `clienteEdit` for truthy.
- `onClienteSaved(c)`: `setClientes(listClientes())`, `selectCliente(c.id)` (auto-seleciona), `setClienteEdit(undefined)`.
- **Faixa de competências salvas:** logo abaixo do picker, quando há `clienteId`, renderizar chips dos `records` já carregados (um por `compKey`, ordem decrescente, rótulo `competenceShort`), cada um clicável para setar `compMonth`/`compYear` (o `useEffect` existente reabre o payload salvo). Botão primário **"Abrir última"** → competência mais recente. Sem registros → texto "Nenhuma competência salva ainda."

## Fluxo de dados

```
listClientes() ─────────────► clientes ──► ClientePicker
ClientePicker.onSelect ─────► selectCliente(id) ─► seta cd (nome/cnpj/regime/atividade/anexo) + setRecords(listApuracoes(id))
records ────────────────────► faixa de competências (chips + "Abrir última")
chip/Abrir última ──────────► upd(compMonth/compYear) ─► useEffect reabre payload salvo
ClientePicker.onNew/onEdit ─► clienteEdit ─► ClienteModal ─► saveCliente ─► onClienteSaved ─► refresh + auto-select
```

## Tratamento de erros / bordas

- Lista de clientes vazia: picker mostra aviso "cadastre"; "+ Nova empresa" funciona.
- Busca sem resultado: estado vazio + atalho de criação.
- Selecionar empresa **não** altera mês/ano correntes (só os chips de competência alteram).
- Criar empresa nova pelo gerador → auto-seleciona ao salvar.
- Consulta de CNPJ com falha: toast de erro (já existe no modal), preenchimento manual segue possível.
- Editar empresa selecionada e salvar → `selectCliente` reexecuta com os dados atualizados.

## Verificação

Sem framework de testes (prática do projeto) → `pnpm typecheck` + navegador (preview "gn", porta 3212):
1. Busca filtra por nome e por CNPJ; seleção carrega regime/atividade/anexo e as competências.
2. Chips de competência reabrem o payload salvo; "Abrir última" pula para a mais recente.
3. "+ Nova empresa" cria e auto-seleciona; "Editar" atualiza o selecionado.
4. `/clientes` continua criando/editando/excluindo normalmente com o `ClienteModal` compartilhado.

## Arquivos

- **Novos:** `components/ClienteModal.tsx`, `components/ClientePicker.tsx`
- **Modificados:** `app/relatorio/page.tsx`, `app/clientes/page.tsx`, `lib/storage.ts`
