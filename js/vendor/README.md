# Dependência local do catálogo

`pdf-lib.esm.min.js` é a distribuição ESM de pdf-lib 1.17.1, sob licença MIT (ver `pdf-lib-LICENSE.md`). O gerador carrega a biblioteca local somente ao gerar o catálogo; não depende de CDN, serviço externo de conversão ou instalação no computador do usuário.

As fontes Times e Helvetica pertencem ao conjunto padrão do PDF. O gerador incorpora a arte original de fundo em `assets/catalogo/capa-oficial.png` e acrescenta a identidade, o título e os textos da capa como elementos do próprio PDF, mantendo a fotografia intacta.

O catálogo sempre consulta os produtos atuais, mantém a opção entre públicos e todos, agrupa pelas categorias do cadastro e distribui até seis produtos por página. A capa faz parte da contagem total, mas não recebe numeração; o rodapé da capa contém os contatos da marca. Produtos sem categoria entram em “Seleção de produtos”.

O botão existente abre o PDF pronto em uma janela, onde é possível baixar ou imprimir. Não usa impressão de HTML, evitando URL, data e cabeçalhos do navegador. Todas as fotos cadastradas precisam carregar; uma falha informa o problema em vez de gerar um arquivo com fotos faltando. Cadastros sem foto são indicados no card.

Execute `npm test` com Node 22 ou superior para verificar paginação e quebras de texto. A conferência visual continua necessária ao trocar a arte ou alterar a composição dos cards.
As fotos dos cards são preparadas em PNG, sem nova compressão JPEG. Apenas margens claras externas são reduzidas, com folga; fotos com cenário preservam o enquadramento. A composição Multiply integra o branco das fotos ao creme da página sem apagar áreas brancas dos produtos. As imagens do cadastro permanecem intactas. A resolução nativa é mantida até 2600 pixels no maior lado, limite para controlar o consumo de memória na exportação.
