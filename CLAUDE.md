# Instruções do projeto cbncuiaba

## Acabamento das telas (guia "Sites com cara de R$ 10 mil", 24/11/2026)

Pedido do Luiz: toda tela, página ou protótipo novo deste projeto segue estes quatro passos. Eles **somam** às regras deste arquivo; quando houver conflito, valem a identidade visual e as decisões já aprovadas do projeto.

1. **Referências visuais.** Quando o Luiz mandar imagens (Pinterest, prints de sites) ou links, usar como **direção**: espaçamento generoso, títulos grandes, paleta contida. Nunca copiar logos, fotos ou textos de outros sites.
2. **Regras de design** (espaçamento, tipografia, hierarquia, movimento, interação): usar as skills **Design Skill (Emil Kowalski)** (`emil-design-eng` em `.claude/skills/`) e **Impeccable (Paul Bakaus)** (plugin ligado em `.claude/settings.json`, carrega ao abrir a sessão). No fim de cada entrega visual, rodar a revisão (`/critique` ou `/audit`) e o acabamento (`/polish`) do Impeccable.
3. **Figma.** O conector do Figma está ligado na conta do Luiz (plano gratuito, leituras limitadas por mês): pedir o link do quadro (frame) específico, ler o desenho e usar as cores e fontes dele, adaptando ao que o projeto já usa.
4. **Teste no navegador em loop até não sobrar problema.** Abrir a tela no navegador de teste (Playwright), tirar prints em **375 px, 1366 px e 1920 px** (e nos temas claro e escuro, se houver); testar cliques, menus, botões, formulários e teclado; corrigir o que quebrou e **repetir até uma rodada sair sem erro**. Só então mostrar ao Luiz.
