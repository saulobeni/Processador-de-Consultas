const METADADOS = {
    Cliente: ["idCliente", "Nome", "Email", "Nascimento", "Senha", "TipoCliente_idTipoCliente", "DataRegistro"],
    Produto: ["idProduto", "Nome", "Descricao", "Preco", "QuantEstoque", "Categoria_idCategoria"],
    Pedido: ["idPedido", "Status_idStatus", "DataPedido", "ValorTotalPedido", "Cliente_idCliente"],
    Pedido_has_Produto: ["idPedidoProduto", "Pedido_idPedido", "Produto_idProduto", "Quantidade", "PrecoUnitario"],
    TipoCliente: ["idTipoCliente", "Descricao"],
    TipoEndereco: ["idTipoEndereco", "Descricao"],
    Categoria: ["idCategoria", "Descricao"],
    Status: ["idStatus", "Descricao"],
    Telefone: ["Numero", "Cliente_idCliente"],
    Endereco: [
        "idEndereco",
        "EnderecoPadrao",
        "Logradouro",
        "Numero",
        "Complemento",
        "Bairro",
        "Cidade",
        "UF",
        "CEP",
        "TipoEndereco_idTipoEndereco",
        "Cliente_idCliente"
    ]
};

// Criterio: Parsing e validacao correta
function validarTabelas(tabelas) {
    tabelas.forEach(t => {
        let tabelaReal = Object.keys(METADADOS)
            .find(meta => meta.toLowerCase() === t.toLowerCase());

        if (!tabelaReal) {
            throw `Tabela inválida: ${t}`;
        }
    });
}

function validarCampos(campos, tabelas) {
    campos.forEach(campo => {
        if (campo.trim() === "*") return;

        let [tabela, atributo] = campo.split(".");

        if (!tabela || !atributo) {
            throw `Campo inválido: ${campo}. Use Tabela.Atributo`;
        }

        let tabelaNaConsulta = tabelas
            .find(t => t.toLowerCase() === tabela.toLowerCase());

        if (!tabelaNaConsulta) {
            throw `Tabela não usada na consulta: ${tabela}`;
        }

        let tabelaReal = Object.keys(METADADOS)
            .find(meta => meta.toLowerCase() === tabela.toLowerCase());

        if (!tabelaReal) {
            throw `Tabela não encontrada: ${tabela}`;
        }

        let atributoReal = METADADOS[tabelaReal]
            .find(attr => attr.toLowerCase() === atributo.toLowerCase());

        if (!atributoReal) {
            throw `Atributo inválido: ${campo}`;
        }
    });
}

function separarCondicoes(condicao) {
    if (!condicao) return [];

    let condicoes = [];
    let atual = "";
    let nivel = 0;
    let tokens = condicao.split(/(\bAND\b|\(|\))/i);

    tokens.forEach(token => {
        if (!token) return;

        if (token === "(") nivel++;
        if (token === ")") nivel--;

        if (/^AND$/i.test(token) && nivel === 0) {
            if (atual.trim()) condicoes.push(atual.trim());
            atual = "";
        } else {
            atual += token;
        }
    });

    if (atual.trim()) condicoes.push(atual.trim());
    return condicoes;
}

function validarParenteses(texto) {
    let nivel = 0;

    for (let char of texto) {
        if (char === "(") nivel++;
        if (char === ")") nivel--;
        if (nivel < 0) throw "Parênteses inválidos na consulta.";
    }

    if (nivel !== 0) throw "Parênteses inválidos na consulta.";
}

function validarCondicoes(condicoes, tabelas) {
    condicoes.forEach(cond => {
        validarParenteses(cond);

        if (/\bOR\b/i.test(cond)) {
            throw "Operador inválido. Use apenas AND para combinar condições.";
        }

        let condLimpa = cond.replace(/[()]/g, " ").trim();

        if (!/(<=|>=|<>|=|<|>)/.test(condLimpa)) {
            throw `Condição inválida: ${cond}`;
        }

        let atributos = extrairAtributos([cond]);
        validarCampos(atributos, tabelas);
    });
}

function parseConsulta(sql) {
    let partes = sql.match(/^SELECT\s+(.+?)\s+FROM\s+(.+)$/i);
    if (!partes) throw "Consulta inválida.";

    let camposArr = partes[1].split(",").map(s => s.trim()).filter(Boolean);
    let resto = partes[2].trim();
    let whereMatch = resto.match(/\s+WHERE\s+/i);
    let fromPart = whereMatch ? resto.slice(0, whereMatch.index).trim() : resto;
    let condicao = whereMatch ? resto.slice(whereMatch.index + whereMatch[0].length).trim() : "";
    let condicoesArr = separarCondicoes(condicao);

    if (/\bJOIN\b/i.test(fromPart)) {
        let baseMatch = fromPart.match(/^(\w+)\s+JOIN\s+/i);
        if (!baseMatch) throw "Consulta inválida.";

        let joins = [];
        let joinRegex = /JOIN\s+(\w+)\s+ON\s+(.+?)(?=\s+JOIN\s+\w+\s+ON\s+|$)/gi;
        let match;

        while ((match = joinRegex.exec(fromPart)) !== null) {
            joins.push({
                table: match[1],
                condition: match[2].trim()
            });
        }

        if (joins.length === 0) throw "JOIN inválido.";

        let tabelas = [baseMatch[1]].concat(joins.map(j => j.table));
        return { camposArr, tabelas, condicoesArr, joins };
    }

    let tabelas = fromPart.split(",").map(s => s.trim()).filter(Boolean);
    if (tabelas.length === 0) throw "Consulta inválida.";

    return { camposArr, tabelas, condicoesArr, joins: [] };
}

// Criterio: Conversao para algebra relacional
function gerarAlgebra(node) {
    if (node.type === "table") {
        return node.name;
    }

    if (node.type === "selection") {
        return `σ(${node.condition})(${gerarAlgebra(node.child)})`;
    }

    if (node.type === "projection") {
        return `π(${node.attributes.join(", ")})(${gerarAlgebra(node.child)})`;
    }

    if (node.type === "join") {
        return `(${gerarAlgebra(node.left)} ⋈ ${node.condition} ${gerarAlgebra(node.right)})`;
    }

    if (node.type === "cartesian") {
        return `(${gerarAlgebra(node.left)} × ${gerarAlgebra(node.right)})`;
    }
}

// Criterio: Interface grafica funcional
function processarConsulta() {
    let sql = document.getElementById("consulta").value.trim();
    let algebraRes = document.getElementById("algebra-result");
    let planoRes = document.getElementById("plano-result");

    try {
        sql = sql.replace(/\n/g, " ").replace(/\s+/g, " ");

        let consulta = parseConsulta(sql);
        let camposArr = consulta.camposArr;
        let tabelas = consulta.tabelas;
        let condicoesArr = consulta.condicoesArr;
        let joins = consulta.joins;

        // VALIDAÇÃO
        // Criterio: Parsing e validacao correta
        validarTabelas(tabelas);
        validarCampos(camposArr, tabelas);
        validarCondicoes(condicoesArr, tabelas);
        validarCondicoes(joins.map(j => j.condition), tabelas);

        // ÁRVORE
        // Criterio: Uso da juncao
        let arvore;

        if (joins.length > 0) {
            let joinNode = makeTable(tabelas[0]);

            joins.forEach(j => {
                joinNode = makeJoin(j.condition, joinNode, makeTable(j.table));
            });

            if (condicoesArr.length > 0) {
                arvore = makeProjection(camposArr,
                    makeSelection(condicoesArr.join(" AND "), joinNode)
                );
            } else {
                arvore = makeProjection(camposArr, joinNode);
            }
        } else {
            arvore = construirArvoreCanonica(camposArr, tabelas, condicoesArr);
        }

        // HEURÍSTICAS
        // Criterio: Heuristicas de reducao de tuplas e atributos
        let arvoreRedTuplas = aplicarReducaoTuplas(deepClone(arvore));
        // Criterio: Heuristica b.i - reordenar folhas: junções mais restritivas primeiro
        arvoreRedTuplas.child = reordenarJuncoesPorSeletividade(arvoreRedTuplas.child);
        let arvoreRedAtrib = aplicarReducaoAtributos(deepClone(arvoreRedTuplas), camposArr);

        // NOVOS RESULTADOS
        // Criterio: Ordem de execucao apresentada
        let planoExecucao = gerarPlanoExecucao(arvoreRedAtrib);
        // Criterio: Conversao para algebra relacional
        let algebra = gerarAlgebra(arvoreRedAtrib);

        algebraRes.textContent = algebra;

        let plano = "";
        planoExecucao.forEach((p, i) => {
            plano += `${i + 1}. ${p}\n`;
        });

        planoRes.textContent = plano;

        // Renderizar Grafo Mermaid
        // Criterio: Exibicao do grafo de operadores otimizado
        let mermaidCode = "graph TD\n" + gerarMermaid(arvoreRedAtrib);
        let graphDiv = document.getElementById("mermaid-graph");

        if (graphDiv) {
            graphDiv.removeAttribute('data-processed');
            graphDiv.innerHTML = mermaidCode;
            mermaid.init(undefined, graphDiv);
        }

    } catch (erro) {
        algebraRes.textContent = "Erro: " + erro;
        planoRes.textContent = "Erro: " + erro;
        let graphDiv = document.getElementById("mermaid-graph");
        if (graphDiv) {
            graphDiv.removeAttribute('data-processed');
            graphDiv.innerHTML = "<!-- Grafo indisponível com erro -->";
        }
    }
}

// Criterio: Ordem de execucao apresentada
function gerarPlanoExecucao(node, plano = []) {
    if (!node) return plano;

    if (node.type === "table") {
        plano.push(`Ler Tabela (TABLE SCAN): Acessar registros da tabela '${node.name}'`);
    }

    if (node.type === "selection") {
        gerarPlanoExecucao(node.child, plano);
        plano.push(`Filtrar Tuplas (SELECTION): Manter apenas registros onde [${node.condition}]`);
    }

    if (node.type === "projection") {
        gerarPlanoExecucao(node.child, plano);
        plano.push(`Extrair Colunas (PROJECTION): Retornar os campos -> ${node.attributes.join(", ")}`);
    }

    if (node.type === "join") {
        gerarPlanoExecucao(node.left, plano);
        gerarPlanoExecucao(node.right, plano);
        plano.push(`Realizar Junção (JOIN): Combinar tabelas usando a condição [${node.condition}]`);
    }

    if (node.type === "cartesian") {
        gerarPlanoExecucao(node.left, plano);
        gerarPlanoExecucao(node.right, plano);
        plano.push(`Produto Cartesiano (CROSS JOIN): Combinar todas as tuplas (Atenção: Operação de Alto Custo)`);
    }

    return plano;
}


// Heurísticas de Otimização de Consultas
// Fábricas de nós da árvore de consulta 
function makeTable(name) {
    let tabelaReal = Object.keys(METADADOS)
        .find(meta => meta.toLowerCase() === name.toLowerCase());

    return {
        type: "table",
        name: tabelaReal || name
    };
}
function makeSelection(condition, child) {
    return { type: "selection", condition: condition, child: child };
}
function makeProjection(attributes, child) {
    return { type: "projection", attributes: attributes, child: child };
}
function makeCartesian(left, right) {
    return { type: "cartesian", left: left, right: right };
}
// Criterio: Uso da juncao
function makeJoin(condition, left, right) {
    return { type: "join", condition: condition, left: left, right: right };
}

// Utilitários 
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function collectTables(node) {
    if (node.type === "table") return new Set([node.name.toLowerCase()]);
    if (node.type === "cartesian" || node.type === "join") {
        var s = collectTables(node.left);
        collectTables(node.right).forEach(function (t) { s.add(t); });
        return s;
    }
    if (node.child) return collectTables(node.child);
    return new Set();
}

function extrairTabelasDaCondicao(cond) {
    var matches = cond.match(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g) || [];
    return new Set(matches.map(function (m) { return m.split(".")[0].toLowerCase(); }));
}

function extrairAtributos(lista) {
    var result = [];
    lista.forEach(function (item) {
        var matches = item.match(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g) || [];
        result = result.concat(matches);
    });
    return result;
}

function unirUnicos(a, b) {
    var s = new Set(a.concat(b));
    return Array.from(s);
}

function isSubset(subset, superset) {
    var ok = true;
    subset.forEach(function (item) { if (!superset.has(item)) ok = false; });
    return ok;
}

// Construtor da Árvore Canônica 
function construirArvoreCanonica(campos, tabelas, condicoes) {
    var fromNode = makeTable(tabelas[0]);
    for (var i = 1; i < tabelas.length; i++) {
        fromNode = makeCartesian(fromNode, makeTable(tabelas[i]));
    }
    if (condicoes.length > 0) {
        fromNode = makeSelection(condicoes.join(" AND "), fromNode);
    }
    return makeProjection(campos, fromNode);
}

// Criterio: Heuristica de reducao de tuplas
// Heurística 1: Redução de Tuplas (σ push-down)
function pushSelectionDown(node, cond) {
    var tablesNeeded = extrairTabelasDaCondicao(cond);

    if (node.type === "table") {
        return makeSelection(cond, node);
    }

    if (node.type === "cartesian" || node.type === "join") {
        var leftTables = collectTables(node.left);
        var rightTables = collectTables(node.right);

        if (tablesNeeded.size === 0) {
            return makeSelection(cond, node);
        }
        if (isSubset(tablesNeeded, leftTables)) {
            node.left = pushSelectionDown(node.left, cond);
            return node;
        }
        if (isSubset(tablesNeeded, rightTables)) {
            node.right = pushSelectionDown(node.right, cond);
            return node;
        }
        // Condição de junção: referencia ambos os lados — fica acima do produto cartesiano
        return makeSelection(cond, node);
    }

    if (node.type === "selection" || node.type === "projection") {
        node.child = pushSelectionDown(node.child, cond);
        return node;
    }

    return node;
}

// Criterio: Uso da juncao
// Converte σ(cond_junção) diretamente acima de × em ⋈ (evita produto cartesiano)
function converterParaJuncao(node) {
    if (!node) return node;

    if (node.type === "selection" && node.child && node.child.type === "cartesian") {
        var tables = extrairTabelasDaCondicao(node.condition);
        var leftTables = collectTables(node.child.left);
        var rightTables = collectTables(node.child.right);
        var refLeft = false;
        var refRight = false;
        tables.forEach(function (t) {
            if (leftTables.has(t)) refLeft = true;
            if (rightTables.has(t)) refRight = true;
        });

        if (refLeft && refRight) {
            return makeJoin(
                node.condition,
                converterParaJuncao(node.child.left),
                converterParaJuncao(node.child.right)
            );
        }
    }

    if (node.type === "cartesian" || node.type === "join") {
        node.left = converterParaJuncao(node.left);
        node.right = converterParaJuncao(node.right);
    } else if (node.child) {
        node.child = converterParaJuncao(node.child);
    }

    return node;
}

function aplicarReducaoTuplas(tree) {
    var projNode = tree;
    if (!projNode.child || projNode.child.type !== "selection") return tree;

    var condicoes = projNode.child.condition.split(/\bAND\b/i).map(function (s) { return s.trim(); });
    projNode.child = projNode.child.child;

    condicoes.forEach(function (cond) {
        projNode.child = pushSelectionDown(projNode.child, cond);
    });

    // Converte σ(cond_junção) sobre × em ⋈, evitando produto cartesiano
    projNode.child = converterParaJuncao(projNode.child);

    return tree;
}

// Criterio: Heuristica de reducao de atributos
// Heurística 2: Redução de Atributos (π push-down)
function pushProjectionDown(node, neededAttrs) {
    if (node.type === "table") {
        var tableAttrs = neededAttrs.filter(function (a) {
            return a.split(".")[0].toLowerCase() === node.name.toLowerCase();
        });
        if (tableAttrs.length > 0) {
            return makeProjection(tableAttrs, node);
        }
        return node;
    }

    if (node.type === "selection") {
        var condAttrs = extrairAtributos([node.condition]);
        var belowNeeded = unirUnicos(neededAttrs, condAttrs);
        node.child = pushProjectionDown(node.child, belowNeeded);
        return node;
    }

    if (node.type === "cartesian" || node.type === "join") {
        var lTables = collectTables(node.left);
        var rTables = collectTables(node.right);
        // Para join, também incluir os atributos usados na condição de junção
        var extraAttrs = (node.type === "join") ? extrairAtributos([node.condition]) : [];
        var allNeeded = unirUnicos(neededAttrs, extraAttrs);
        var leftNeeded = allNeeded.filter(function (a) { return lTables.has(a.split(".")[0].toLowerCase()); });
        var rightNeeded = allNeeded.filter(function (a) { return rTables.has(a.split(".")[0].toLowerCase()); });
        node.left = pushProjectionDown(node.left, leftNeeded);
        node.right = pushProjectionDown(node.right, rightNeeded);
        return node;
    }

    if (node.type === "projection") {
        var combinedNeeded = unirUnicos(neededAttrs, node.attributes);
        node.child = pushProjectionDown(node.child, combinedNeeded);
        return node;
    }

    return node;
}

// Criterio: Heuristica b.i - reordenar nós folha por seletividade (junções mais restritivas primeiro)
function contarSelecoes(node) {
    if (!node) return 0;
    let count = node.type === "selection" ? 1 : 0;
    if (node.child) count += contarSelecoes(node.child);
    if (node.left) count += contarSelecoes(node.left);
    if (node.right) count += contarSelecoes(node.right);
    return count;
}

function reordenarJuncoesPorSeletividade(node) {
    if (!node) return node;

    if (node.type === "join" || node.type === "cartesian") {
        node.left = reordenarJuncoesPorSeletividade(node.left);
        node.right = reordenarJuncoesPorSeletividade(node.right);

        let leftCount = contarSelecoes(node.left);
        let rightCount = contarSelecoes(node.right);

        if (rightCount > leftCount) {
            let temp = node.left;
            node.left = node.right;
            node.right = temp;
        }
    } else if (node.child) {
        node.child = reordenarJuncoesPorSeletividade(node.child);
    }

    return node;
}

function aplicarReducaoAtributos(tree, campos) {
    if (campos.length === 1 && campos[0].trim() === "*") {
        return tree;
    }
    var atribsTopo = extrairAtributos(tree.attributes || campos);
    if (atribsTopo.length === 0) return tree;

    tree.child = pushProjectionDown(tree.child, atribsTopo);
    return tree;
}

// Renderizador de Árvore (formato indentado) 
function getLabelDoNo(node) {
    if (node.type === "table") return "[" + node.name + "]";
    if (node.type === "selection") return "σ(" + node.condition + ")";
    if (node.type === "projection") return "π(" + node.attributes.join(", ") + ")";
    if (node.type === "cartesian") return "× (produto cartesiano)";
    if (node.type === "join") return "⋈(" + node.condition + ")";
    return "?";
}

function getFilhosDoNo(node) {
    if (node.type === "cartesian" || node.type === "join") return [node.left, node.right];
    if (node.child) return [node.child];
    return [];
}

function renderNo(node, prefixo, isUltimo) {
    var conector = isUltimo ? "└── " : "├── ";
    var prefixoFilho = isUltimo ? "    " : "│   ";
    var linha = prefixo + conector + getLabelDoNo(node) + "\n";
    var filhos = getFilhosDoNo(node);
    for (var i = 0; i < filhos.length; i++) {
        linha += renderNo(filhos[i], prefixo + prefixoFilho, i === filhos.length - 1);
    }
    return linha;
}

function renderizarArvore(node) {
    var resultado = getLabelDoNo(node) + "\n";
    var filhos = getFilhosDoNo(node);
    for (var i = 0; i < filhos.length; i++) {
        resultado += renderNo(filhos[i], "", i === filhos.length - 1);
    }
    return resultado;
}

// Criterio: Exibicao do grafo de operadores otimizado
// Renderizador de Árvore Visual (Mermaid)
let mermaidIdCounter = 0;

function gerarMermaid(node) {
    if (!node) return "";
    let lines = [];
    mermaidIdCounter = 0;

    function traverse(n) {
        if (!n._id) n._id = "node" + (mermaidIdCounter++);

        let rawLabel = getLabelDoNo(n);
        // Evitar quebra de sintaxe do mermaid (aspas duplas)
        let safeLabel = rawLabel.replace(/"/g, "'");

        // Format based on type
        let nodeDef = "";
        if (n.type === "table") {
            nodeDef = `${n._id}[("${safeLabel}")]`; // Database shape [(...)]
        } else if (n.type === "selection") {
            nodeDef = `${n._id}{{"${safeLabel}"}}`; // Hexagon
        } else if (n.type === "projection") {
            nodeDef = `${n._id}[/"${safeLabel}"/]`; // Parallelogram [/ ... /]
        } else if (n.type === "join") {
            nodeDef = `${n._id}{"${safeLabel}"}`; // Rhombus
        } else if (n.type === "cartesian") {
            nodeDef = `${n._id}("${safeLabel}")`; // Round edges
        } else {
            nodeDef = `${n._id}["${safeLabel}"]`;
        }

        lines.push(nodeDef);

        let filhos = getFilhosDoNo(n);
        for (let filho of filhos) {
            if (filho) {
                traverse(filho);
                lines.push(`${n._id} --> ${filho._id}`);
            }
        }
    }

    traverse(node);
    return lines.join("\n");
}
