function processarConsulta() {
    let sql = document.getElementById("consulta").value.trim();
    let resultado = document.getElementById("resultado");

    try {
        // Remove quebras de linha extras
        sql = sql.replace(/\n/g, " ").replace(/\s+/g, " ");

        let partes = sql.match(/SELECT\s+(.+?)\s+FROM\s+(.+?)(\s+WHERE\s+(.+))?$/i);

        if (!partes) {
            throw "Consulta inválida.";
        }

        let campos = partes[1];
        let tabela = partes[2];
        let condicao = partes[4] || "sem condição";

        let algebra = `π(${campos}) σ(${condicao}) (${tabela})`;

        let plano = `
Consulta SQL:
${sql}

Álgebra Relacional:
${algebra}

Plano de Execução:
1. Ler tabela ${tabela}
2. Aplicar filtro ${condicao}
3. Projetar campos ${campos}
        `;

        resultado.textContent = plano;

    } catch (erro) {
        resultado.textContent = "Erro: " + erro;
    }
}
