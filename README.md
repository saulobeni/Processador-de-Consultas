# Processador de Consultas SQL (Simulador de Álgebra Relacional)

Este projeto é um simulador pedagógico projetado para interpretar comandos `SELECT` (SQL) e traduzi-los em representações otimizadas de **Álgebra Relacional**. O software implementa analisadores e converte a query de texto original em uma árvore (AST) aplicando Regras Heurísticas baseadas nas teorias clássicas de Bancos de Dados, garantindo uma execução de consulta eficiente.

## Funcionalidades

- **Parser SQL Simplificado**: Suporta projeções, seleções simples e múltiplas (`AND`), cruzamento e junção de tabelas (`FROM T1, T2` ou `JOIN`).
- **Otimizador Algébrico**: Utiliza as heurísticas de otimização de consultas:
  - **Push-down de Seleção**: Empurra as operações de filtro (σ) para o mais baixo possível na árvore para reduzir a quantidade de tuplas cedo.
  - **Push-down de Projeção**: Empurra as operações de projeção (π) para o nível inferior da árvore para minimizar dados redundantes na memória.
  - **Conversão de JOIN**: Identifica "Produtos Cartesianos + WHERE" convertendo-os em Junções efetivas (⋈), otimizando radicalmente a carga na CPU.
- **Grafo de Operadores Visual**: Interface visual em *Dark Mode* que renderiza interativamente o diagrama da árvore de execução usando Mermaid.js.
- **Detalhamento do Plano**: Geração da Álgebra Relacional em texto bruto e Plano de Execução em português passo a passo.

## Interface Gráfica

A nova interface do usuário segue design **Premium em Dark Mode** com:
- Painel para digitação e manipulação instantânea.
- *Glassmorphism* em seções.
- Organização lateralizada fluída (100% *width*).
- Uso do Mermaid.js para plotagem visual dinâmica e exportável em SVG.

## Modelagem / Metadados

O processador já está alimentado com os metadados de uma base de um comércio fictício:
- `Cliente` (idCliente, Nome, Email...)
- `Produto` (idProduto, Nome, Preco...)
- `Pedido` (idPedido, DataPedido, ValorTotalPedido...)
- `Endereco`
- `Categoria`
- `Status`
- etc.

## Como Testar

1. Baixe o repositório ou navegue até a raiz do projeto.
2. Abra o arquivo `index.html` em qualquer navegador (Chrome, Edge, Firefox, etc). 
*(Não há necessidade de compilar nada ou rodar servidores em localhost, a aplicação é Client-Side Vanilla JS).*
3. Insira ou copie consultas SQL válidas no campo principal.
   *Dica: Você pode verificar o arquivo `exemplos_consultas.txt` para testar operações de Cartesianas e Junções Explícitas.*
4. Clique em **"Otimizar e Gerar Grafo"**.
5. Observe os 3 painéis:
   - **Álgebra Relacional**: Notação matemática simplificada gerada pela consulta.
   - **Plano de Execução**: Passo a passo de leitura (Scan), filtragem e projeção gerada para o Motor de BD fictício.
   - **Grafo Visual**: Arvore bottom-up (Lendo tabelas na parte inferior até a projeção final no topo).

## Tecnologias Utilizadas

- **HTML5 e CSS3** (Vanilla): Sem uso de frameworks, CSS avançado (Flex/Grid) aplicado e Media Queries.
- **JavaScript (ES6+)**: Logica de negócio, Parser RegEx, algoritmos de grafos e heurísticas de manipulação de nós de árvores estruturadas.
- **Mermaid.js**: Ferramenta Open Source acoplada para renderização declarativa e desenhada dos grafos de bancos de dados.
