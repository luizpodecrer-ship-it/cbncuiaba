# CBN Cuiabá — front-end do portal

HTML, CSS e JavaScript estáticos (sem dependências nem build) para integração ao WordPress.
Abra `index.html` no navegador para navegar por todas as páginas.

## Modelos de página

| Arquivo | Modelo no WordPress |
|---|---|
| `index.html` | Página inicial |
| `noticias/*.html` | Notícia (single). Todos os arquivos usam o mesmo modelo; variam apenas título, foto e editoria. Há três variações: notícia, artigo (com caixa do autor) e entrevista (com área de áudio/vídeo) |
| `noticias.html`, `politica.html`, `cidades.html`, `economia-negocios.html`, `esporte-cultura.html` | Editoria (category) |
| `entrevistas.html` | Editoria de entrevistas |
| `artigos.html` | Editoria de artigos |
| `cbn-especiais.html`, `aguas-cuiaba.html`, `agroligadas.html`, `comprova.html` | Especiais, com abas (a última mostra o estado "sem publicações") |
| `stories.html` | Lista de stories, com visualizador em tela cheia |
| `busca.html` | Resultado de busca (`?s=termo`) |
| `expediente.html`, `anuncie.html`, `fale-conosco.html`, `politica-de-privacidade.html` | Páginas institucionais |
| `404.html` | Página não encontrada |

## Publicidade (formatos fixos)

| Espaço | Formato | Classe |
|---|---|---|
| Topo | 990 × 120 | `.ad--topo` |
| Secundário e Final secundário | 728 × 90 | `.ad--secundario` |
| Lateral | 300 × 250 | `.ad--lateral` |

O banner entra dentro de `.ad__box`. Em telas mais estreitas que o formato, a mesma peça encolhe na proporção, sem corte.

## Observações

- Logo: sempre aplicado em branco sobre vermelho ou fundo escuro, nunca em cinza nem com transparência. `logo-cbn-cuiaba.svg` é o logo completo; `logo-cbn-mark.svg` é só a marca "CBN", para espaços pequenos (ex.: selo do autor na notícia).

- Cards de notícia: em todo o portal mostram apenas editoria, título e data. A linha fina aparece somente dentro da página da notícia.

- Navegação suave: links internos trocam a página sem recarregar (o cabeçalho não pisca e a rádio continua tocando). A cada troca o script dispara o evento `cbn:navigate` no `document` — use-o para recarregar os banners e registrar a visualização no Analytics. Para desligar, use `<body data-soft-nav="off">`; os links voltam a abrir normalmente.
- Tema: abre em Claro; o visitante pode escolher Claro, Escuro ou Automático (salvo em `localStorage`).
- Rádio ao vivo: o endereço da transmissão está no atributo `data-stream` do `<audio id="radio">`.
- Conteúdo de exemplo: os textos das notícias, os títulos das entrevistas, os nomes da equipe e os contatos são marcadores de posição.
- Os formulários e a newsletter apenas simulam o envio (`data-demo-form`); precisam ser ligados ao serviço real.
- A pasta `preview/` contém capturas de tela e não faz parte do site.
