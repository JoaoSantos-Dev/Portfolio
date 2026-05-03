# Radar GameDev

Radar GameDev é um MVP estático de uma plataforma web de curadoria para estudantes de Jogos Digitais. A primeira versão funciona como um mural de cards com busca, filtros por categoria e filtros por tags.

## Como rodar localmente

Abra `index.html` diretamente no navegador ou rode um servidor local simples:

```bash
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Estrutura de arquivos

- `index.html`: estrutura da homepage.
- `admin-card.html`: tela administrativa para criar cards.
- `css/styles.css`: identidade visual, responsividade e componentes.
- `js/firebase-config.js`: configuração do Firebase Web SDK.
- `js/firebase.js`: Auth, Firestore, Storage, usuários e recursos.
- `js/data.js`: recursos estáticos opcionais. O array inicial está vazio.
- `js/app.js`: renderização, busca, filtros e leitura do Firestore.
- `js/admin-card.js`: formulário admin, preview, rascunho e salvamento no Firebase.
- `Logo.webp`: logo usada no header.
- `Icon.webp`: ícone usado no favicon visual, badge, rodapé e empty state.
- `Imagens.png`: asset visual disponível para cards ou fundos futuros.

## Como criar recursos

O fluxo principal é pelo painel admin. Cards publicados são salvos na collection `resources` do Firestore. Imagens WEBP enviadas pelo admin são salvas no Firebase Storage em `resources/{resourceId}/`.

Rascunhos do formulário são salvos em:

```txt
radar-admin-card-draft-new
radar-admin-card-draft-edit-{id}
```

## Como editar recursos estáticos

O app não depende mais de cards salvos no `localStorage`. Para migração, o painel admin mostra o botão `Migrar locais` se encontrar dados antigos na chave `radar-custom-resources`.

Cada documento em `resources` segue este formato:

```js
{
  id: "meu-recurso",
  section: "curadoria",
  title: "Meu Recurso",
  type: "Curso",
  country: "Reino Unido",
  description: "Descrição curta do recurso.",
  tags: ["AAA", "Gameplay"],
  url: "https://exemplo.com",
  cta: "Acessar perfil",
  imageUrl: "",
  imagePath: "",
  wallpaper: false,
  imagePositionY: 50,
  useLibraryGif: false,
  libraryGifKey: "",
  libraryGifMode: "cover",
  libraryGifPositionY: 50,
  special: false,
  pinned: false,
  status: "published",
  featured: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: "uid",
  updatedBy: "uid"
}
```

Para adicionar imagem em um card, use upload WEBP pelo painel admin.
Use `wallpaper: true` quando a imagem deve preencher a área visual com corte (`object-fit: cover`). Quando `imageUrl` fica vazio, o card é textual.
Use `special: true` para cards com destaque animado e brilho sutil, como avisos ou recomendações importantes.
Use `pinned: true` para fixar no topo. Apenas um card deve ficar fixado por vez; `featured` e `special` são apenas marcações visuais.

## Arquitetura editorial

A home abre sempre em `Curadoria`. Os cards usam o campo:

```js
section: "curadoria" | "profissionais" | "empresas"
```

Se um card antigo não tiver `section`, o frontend classifica pelo `type` e usa `curadoria` como fallback seguro.

Categorias disponíveis por seção:

- `curadoria`: Curso, Vídeo, Artigo, Ferramenta, Asset, Comunidade, Evento, Documentação, Repositório, Dica, Vaga.
- `profissionais`: Profissional, Gameplay Programming, Game Design, Level Design, Technical Art, Environment Art, Character Art, UI/UX, Narrative Design, Producer, Audio, QA.
- `empresas`: AAA, AA, Indie, Mobile, Outsourcing, Publisher, Serious Games, Game Tech, QA/Localization, Porting, Estúdio Brasileiro, Estúdio Internacional.

## GIFs da biblioteca

Imagens estáticas enviadas pelo admin devem ser WEBP. Animações não são salvas no card: coloque arquivos GIF ou WEBP animados em `assets/gifs/` e registre cada arquivo em `assets/gifs.txt`.

O padrão do `assets/gifs.txt` é uma linha por arquivo:

```txt
better-call-saul.webp
radar-pulse.gif
card-shine.webp
```

Linhas começando com `#` são comentários. O JavaScript gera automaticamente a chave pelo nome do arquivo, por exemplo `better-call-saul.webp` vira `libraryGifKey: "better-call-saul"`.

O card salva apenas:

```js
useLibraryGif: true,
libraryGifKey: "better-call-saul",
libraryGifMode: "cover",
libraryGifPositionY: 50
```

Se `useLibraryGif` estiver ativo e a chave existir no catálogo, o GIF tem prioridade visual sobre a imagem WEBP do card.

## Assets usados

- Logo: `Logo.webp`
- Ícone: `Icon.webp`
- Wallpaper/asset visual: `Imagens.png`

## Firebase

Configure suas chaves em `js/firebase-config.js`. As regras sugeridas estão em `firebase-rules.txt`.

Antes do deploy, cole seu UID admin na regra do Storage em:

```txt
COLE_SEU_UID_ADMIN_AQUI
```

O Firestore usa a coleção `users` para identificar admin aprovado (`status: "approved"` e `role: "admin"`). O Storage usa UID porque regras de Storage ficam mais simples e seguras para este MVP.

## Próximos passos

- Evoluir a curadoria com dados reais e revisão editorial.
- Criar gerenciamento completo de recursos publicados e rascunhos.
