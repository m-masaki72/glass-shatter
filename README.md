# GLASS RUSH — ガラス破壊の実験室

ガラスの支えを削り、大きな落下と破砕を楽しむ3Dゲームです。

[ゲームを開く](https://m-masaki72.github.io/glass-shatter/)

## 遊び方

- ガラスをクリック・タップして打撃。ハンマーは広く欠き、ピックは狭く深く削る。
- 「形を変える」で形を選ぶ。ことば入力は内蔵ルールで色・大きさ・個数を指定する。
- 空白からのドラッグか右ドラッグで回転。矢印キーで照準、Spaceで打撃、1・2で道具を変更する。
- 「もう一度」で再挑戦。得点を押すと最大の一撃のTOP 5を見られる。

選んだ形・音の設定・ランキングはこのブラウザに保存します。音は最初の操作から再生します。設定でOFFにできます。
画面下のX・LINE・URLコピーから共有できます。「保存データを消す」はこのゲームの記録だけを消します。

## 起動と検証

Node.js 24以上とPython 3を使います。

```sh
npm ci
npm start
```

[ローカルで開く](http://127.0.0.1:8771/)。終了はCtrl+C。

```sh
npm run verify
npx playwright install chromium
npm run test:e2e
```

単体テストでゲームの計算・保存を、E2Eで実際の操作・再開・スマホ表示・起動失敗を確認します。
E2EはChromiumのソフトウェア描画を使います。Safariと実機の音声・操作は別途確認が必要です。

## 公開

GitHub PagesのSourceを **GitHub Actions** にします。`main`へのpushでテストが成功すると公開します。
公開するのは`dist/`とライセンスだけです。外部API・APIキー・専用サーバーは不要です。
favicon・OGP・JSON-LD・サイトマップ・404ページを同梱しています。
公開先を変える場合は`dist/index.html`の公開URL・共有リンクと`dist/sitemap.xml`・`robots.txt`・`404.html`を更新してください。

## コード

- `dist/js/`：ゲーム・描画・音・保存。入口は`game-bootstrap.js`。
- `dist/styles/`：ゲーム画面と共有部分のCSS。
- `dist/vendor/`：公開に必要なライブラリとライセンス。
- `tests/unit/`：単体テスト。`tests/e2e/`：実ブラウザのテスト。
- `tools/`：構文確認とアイコン生成。

ゲーム向けの剛体と破砕の近似です。実際のガラスの亀裂・応力を厳密に再現するものではありません。

## ライセンス

自作コードは[MIT](LICENSE)。同梱の[Three.js](dist/vendor/THREE-LICENSE.txt)はMIT、[Rapier](dist/vendor/RAPIER-LICENSE.txt)はApache-2.0です。

## 別のPCで続ける

このリポジトリをcloneして、`npm ci`、`npx playwright install chromium`、`npm start`を実行します。
Python 3とNode.js 24以上が必要です。GitHub Pagesの公開にはSourceをGitHub Actionsに設定してください。
初回の公開が失敗した場合は、設定後にActionsのCheckを再実行します。

複数の3DゲームのE2Eは同時に実行せず、ゲームごとに順番に実行してください。
ソフトウェア描画で複数の大きな3D画面を動かすと、GPU競合で検証が遅れることがあります。
