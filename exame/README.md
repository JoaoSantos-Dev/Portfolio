# Exame de Graduação dos GameDev's

Página estática para exibir o ranking do simulado prático da 3ª fase de Programação de Jogos Digitais.

## Editar o ranking

Edite o arquivo `ranking.txt` usando uma linha para cada participante, no formato `Nome Sobrenome;pontuação`. A pontuação deve ser um número inteiro de 0 a 32.

```txt
João Silva;18
Maria Santos;27
```

Linhas vazias ou inválidas são ignoradas. O ranking é ordenado automaticamente da maior para a menor nota.

## Executar localmente

Na pasta do projeto, inicie um servidor local. Com Python instalado, use:

```bash
python3 -m http.server 8000
```

Depois acesse [http://localhost:8000](http://localhost:8000) no navegador. Abrir o `index.html` diretamente pelo protocolo `file://` pode impedir o carregamento do arquivo `.txt` por causa das restrições de segurança do navegador.

## Publicar no GitHub Pages

1. Envie estes arquivos para a raiz de um repositório no GitHub.
2. Acesse **Settings > Pages** no repositório.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Selecione a branch principal, a pasta `/ (root)` e salve.

O endereço publicado aparecerá na mesma tela após o deploy.

## Minigame da cerimônia

Clique em qualquer participante do pódio para abrir o corredor cerimonial. O personagem é controlado clicando ou tocando dentro do corredor.

Os sons atuais são gerados pelo navegador. Para usar arquivos próprios futuramente, adicione-os em `assets/audio` e preencha os caminhos do objeto `OPTIONAL_AUDIO_FILES` no início de `game.js`. As propriedades `crowd` e `firework` substituem, respectivamente, o som da plateia e dos fogos.

### Fotos do pódio

As fotos exibidas na moldura ao fim do corredor ficam na pasta `IMG`: `1.png` para o primeiro participante do pódio, `2.png` para o segundo e `3.png` para o terceiro. O jogo recorta cada imagem automaticamente sem deformá-la.
