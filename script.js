function processarConsulta() {
    let sql = document.getElementById("consulta").value.trim();
    let resultado = document.getElementById("resultado");

    try {
        sql = sql.replace(/\n/g, " ").replace(/\s+/g, " ");

        let campos = "";
        let tabelas = [];
        let condicao = "";
        let joinCond = null;

        // 🔵 Detecta JOIN explícito
        let joinMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)\s+JOIN\s+(\w+)\s+ON\s+(.+?)(\s+WHERE\s+(.+))?$/i);

        if (joinMatch) {
            campos = joinMatch[1];
            tabelas = [joinMatch[2], joinMatch[3]];
            joinCond = joinMatch[4];
            condicao = joinMatch[6] || "";
        } else {
            // 🟢 Caso simples
            let partes = sql.match(/SELECT\s+(.+?)\s+FROM\s+(.+?)(\s+WHERE\s+(.+))?$/i);
            if (!partes) throw "Consulta inválida.";

            campos = partes[1];
            tabelas = partes[2].split(",").map(s => s.trim());
            condicao = partes[4] || "";
        }

        let camposArr = campos.split(",").map(s => s.trim());
        let condicoesArr = condicao ? condicao.split(/\bAND\b/i).map(s => s.trim()) : [];

        // 🔴 Construção da árvore
        let arvore;

        if (joinCond) {
            let left = makeTable(tabelas[0]);
            let right = makeTable(tabelas[1]);
            let joinNode = makeJoin(joinCond, left, right);

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

        // 🔵 Heurísticas
        let arvoreRedTuplas = aplicarReducaoTuplas(deepClone(arvore));
        let arvoreRedAtrib  = aplicarReducaoAtributos(deepClone(arvoreRedTuplas), camposArr);

        // 🔴 NOVO: plano de execução baseado na árvore
        let planoExecucao = gerarPlanoExecucao(arvoreRedAtrib);

        let plano = `
Consulta SQL:
${sql}

Plano de Execução Otimizado:
`;

        planoExecucao.forEach((p, i) => {
            plano += `${i + 1}. ${p}\n`;
        });

        plano += `
=== Árvore Otimizada ===
${renderizarArvore(arvoreRedAtrib)}
`;

        resultado.textContent = plano;

    } catch (erro) {
        resultado.textContent = "Erro: " + erro;
    }
}

function gerarPlanoExecucao(node, plano = []) {
    if (!node) return plano;

    if (node.type === "table") {
        plano.push(`SCAN ${node.name}`);
    }

    if (node.type === "selection") {
        gerarPlanoExecucao(node.child, plano);
        plano.push(`SELECT ${node.condition}`);
    }

    if (node.type === "projection") {
        gerarPlanoExecucao(node.child, plano);
        plano.push(`PROJECT ${node.attributes.join(", ")}`);
    }

    if (node.type === "join") {
        gerarPlanoExecucao(node.left, plano);
        gerarPlanoExecucao(node.right, plano);
        plano.push(`JOIN ${node.condition}`);
    }

    if (node.type === "cartesian") {
        gerarPlanoExecucao(node.left, plano);
        gerarPlanoExecucao(node.right, plano);
        plano.push(`CARTESIAN PRODUCT`);
    }

    return plano;
}


// Heurísticas de Otimização de Consultas


// Fábricas de nós da árvore de consulta 
function makeTable(name) {
    return { type: "table", name: name };
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
        collectTables(node.right).forEach(function(t) { s.add(t); });
        return s;
    }
    if (node.child) return collectTables(node.child);
    return new Set();
}

function extrairTabelasDaCondicao(cond) {
    var matches = cond.match(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g) || [];
    return new Set(matches.map(function(m) { return m.split(".")[0].toLowerCase(); }));
}

function extrairAtributos(lista) {
    var result = [];
    lista.forEach(function(item) {
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
    subset.forEach(function(item) { if (!superset.has(item)) ok = false; });
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

// Heurística 1: Redução de Tuplas (σ push-down)
function pushSelectionDown(node, cond) {
    var tablesNeeded = extrairTabelasDaCondicao(cond);

    if (node.type === "table") {
        return makeSelection(cond, node);
    }

    if (node.type === "cartesian") {
        var leftTables  = collectTables(node.left);
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

// Converte σ(cond_junção) diretamente acima de × em ⋈ (evita produto cartesiano)
function converterParaJuncao(node) {
    if (!node) return node;

    if (node.type === "selection" && node.child && node.child.type === "cartesian") {
        var tables      = extrairTabelasDaCondicao(node.condition);
        var leftTables  = collectTables(node.child.left);
        var rightTables = collectTables(node.child.right);
        var refLeft     = false;
        var refRight    = false;
        tables.forEach(function(t) {
            if (leftTables.has(t))  refLeft  = true;
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
        node.left  = converterParaJuncao(node.left);
        node.right = converterParaJuncao(node.right);
    } else if (node.child) {
        node.child = converterParaJuncao(node.child);
    }

    return node;
}

function aplicarReducaoTuplas(tree) {
    var projNode = tree;
    if (!projNode.child || projNode.child.type !== "selection") return tree;

    var condicoes = projNode.child.condition.split(/\bAND\b/i).map(function(s) { return s.trim(); });
    projNode.child = projNode.child.child;

    condicoes.forEach(function(cond) {
        projNode.child = pushSelectionDown(projNode.child, cond);
    });

    // Converte σ(cond_junção) sobre × em ⋈, evitando produto cartesiano
    projNode.child = converterParaJuncao(projNode.child);

    return tree;
}

// Heurística 2: Redução de Atributos (π push-down)
function pushProjectionDown(node, neededAttrs) {
    if (node.type === "table") {
        var tableAttrs = neededAttrs.filter(function(a) {
            return a.split(".")[0].toLowerCase() === node.name.toLowerCase();
        });
        if (tableAttrs.length > 0) {
            return makeProjection(tableAttrs, node);
        }
        return node;
    }

    if (node.type === "selection") {
        var condAttrs   = extrairAtributos([node.condition]);
        var belowNeeded = unirUnicos(neededAttrs, condAttrs);
        node.child = pushProjectionDown(node.child, belowNeeded);
        return node;
    }

    if (node.type === "cartesian" || node.type === "join") {
        var lTables  = collectTables(node.left);
        var rTables  = collectTables(node.right);
        // Para join, também incluir os atributos usados na condição de junção
        var extraAttrs = (node.type === "join") ? extrairAtributos([node.condition]) : [];
        var allNeeded  = unirUnicos(neededAttrs, extraAttrs);
        var leftNeeded  = allNeeded.filter(function(a) { return lTables.has(a.split(".")[0].toLowerCase()); });
        var rightNeeded = allNeeded.filter(function(a) { return rTables.has(a.split(".")[0].toLowerCase()); });
        node.left  = pushProjectionDown(node.left,  leftNeeded);
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
    if (node.type === "table")      return "[" + node.name + "]";
    if (node.type === "selection")  return "σ(" + node.condition + ")";
    if (node.type === "projection") return "π(" + node.attributes.join(", ") + ")";
    if (node.type === "cartesian")  return "× (produto cartesiano)";
    if (node.type === "join")       return "⋈(" + node.condition + ")";
    return "?";
}

function getFilhosDoNo(node) {
    if (node.type === "cartesian" || node.type === "join") return [node.left, node.right];
    if (node.child) return [node.child];
    return [];
}

function renderNo(node, prefixo, isUltimo) {
    var conector     = isUltimo ? "└── " : "├── ";
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
