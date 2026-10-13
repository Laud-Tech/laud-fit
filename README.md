# Laud Fit

Aplicativo de treino e acompanhamento corporal, self-hosted, da **Laud Tech**. Roda como uma stack
no Portainer (duas imagens: `api` e `web`), funciona no navegador e como PWA (iPhone e Android) e
terá um APK Android próprio, com modo offline.

> Projeto privado. Em desenvolvimento.

## De onde vem

- **Base:** [openGym](https://github.com/DuarteSantos8/openGym) v1.4.1 (commit `5ec23d3b`),
  © Duarte Santos, AGPL-3.0-or-later. Esta árvore parte dele sem alterações; o histórico do que
  mudou aqui está nos commits deste repositório. O README original está em
  [`docs/openGym-upstream-README.md`](docs/openGym-upstream-README.md).
- **Funcionalidades portadas:** [GymMane](https://github.com/InlitX/GymMane) (InlitX, GPL-3.0 com
  termo adicional de atribuição). Ao portar qualquer parte dele, o app passa a exibir
  "Based on GymMane by InlitX" na tela Sobre.
- **Licenças e avisos:** [LICENSE](LICENSE) (AGPL-3.0) e [NOTICE.md](NOTICE.md). As animações dos
  exercícios (`catalogue/media/`) pertencem à Gym visual e só podem ser mantidas, sem alteração e
  com o aviso, em uso **não comercial**. Se o Laud Fit virar produto, é preciso licença própria em
  gymvisual.com ou trocar a mídia.

AGPL: quem usa uma versão modificada pela rede tem direito ao código-fonte dela. Enquanto o
repositório for privado, dê acesso de leitura às pessoas que usarem a instância.

## Imagens

Publicadas pelo GitHub Actions (`.github/workflows/publish.yml`) no GHCR, privadas:

| Imagem | Tags |
|---|---|
| `ghcr.io/laud-tech/laud-fit/api` | `edge` (cada push na `main`), `X.Y.Z`, `X.Y`, `latest` (tag `vX.Y.Z`), `sha-<7>` |
| `ghcr.io/laud-tech/laud-fit/web` | idem |

## Stacks do Portainer

- [`deploy/stack-fit-dev.yml`](deploy/stack-fit-dev.yml): teste em `fit-dev.laud.tec.br`, em paralelo
  ao openGym atual. Leia o cabeçalho do arquivo antes do primeiro deploy (registro privado no
  Portainer, pasta de dados, primeiro perfil).

## Desenvolvimento

Veja [`CLAUDE.md`](CLAUDE.md) (arquitetura em uma página) e [`CONTRIBUTING.md`](CONTRIBUTING.md).
Dados novos do Laud Fit (cardio e trilhas GPS) ficam em SQLite (`laudfit.db`, dentro de `DATA_DIR`);
usuários, passkeys e o estado de treino continuam nos arquivos JSON do openGym.
