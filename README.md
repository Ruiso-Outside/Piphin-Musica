# Piphin Música

Baixe músicas livres de graça e ouça junto com as suas, com playlists, curtidas e equalizador. Módulo do [Piphin Hub](https://github.com/Ruiso-Outside/Piphin-Hub) (cerca de 300 KB).

**Só fontes legais**: todas as músicas vêm de artistas que liberaram o download (Creative Commons e domínio público). Cada música mostra a licença e o que ela permite, e os créditos ficam guardados para copiar.

- **Descobrir**: busca em três fontes abertas, sem conta nem chave
  - [Openverse](https://openverse.org): junta Jamendo, ccMixter, Wikimedia e outros
  - [ccMixter](https://ccmixter.org): por gênero
  - [Internet Archive](https://archive.org/details/netlabels): álbuns inteiros de netlabels
- **Filtro "Só as que posso usar em vídeos"**: só CC BY, CC BY-SA, CC0 e domínio público
- **Ouvir antes de baixar**, **baixar** com um clique (com progresso) ou o álbum inteiro; os arquivos vão para `Música\Piphin Música` (dá para mudar)
- **Suas músicas**: adicione arquivos ou pastas inteiras (MP3, M4A, AAC, OGG, Opus, FLAC, WAV, WebM, WMA). Nome, artista, álbum e capa são lidos das tags
- **Biblioteca** com filtro, ordenação e as abas Todas / Baixadas / Minhas
- **Curtidas** e **playlists**: criar, renomear, arrastar para mudar a ordem, arrastar músicas para a playlist ao lado, importar e exportar `.m3u8`
- **Player**: fila, aleatório, repetir, volume e **equalizador** de 10 bandas com predefinições. Funciona com as teclas de mídia do teclado e do Windows; a música continua ao fechar a janela do Hub
- **Créditos**: o texto de atribuição de cada música baixada, com a licença explicada em palavras simples
- **IA**: com o Piphin LLM, a IA busca e baixa músicas, cria playlists, toca e controla o player

## Mídia do Hub
Com o Piphin Hub 1.7.0 ou mais novo, as músicas baixadas entram na **Mídia** do Hub com a licença e o crédito, e o Piphin Vídeo usa direto (e lembra o crédito ao exportar).
No menu ⋮ de uma música: **Usar no Piphin Vídeo** (ou no Piphin Som). E o que vier de outro módulo ("Abrir no Piphin Música", por exemplo uma música feita no Piphin Som) entra na biblioteca e toca.

## Estrutura

- `module/`
  - `sources.js`: as fontes de música livre
  - `backend.js`: biblioteca, playlists e downloads; também o servidor local que entrega os arquivos (e o som dos sites antes de baixar) para o player
- `web/`
  - `js/player.js`: o player (Web Audio)
  - `js/app.js`: as telas
  - `vendor/mediabunny.min.js`: leitura das tags ([Mediabunny](https://mediabunny.dev), MPL-2.0)

```
npm run icons    # ícones (Lucide) em web/icons.css
npm run icon     # icons/musica.png
npm run module   # dist/piphin-module-musica-<versão>.zip
```
