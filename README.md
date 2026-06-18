# Stock Notify Worker

Cloudflare WorkersでQQQの株価を定期取得し、条件に応じてSlackへ通知する株価通知アプリです。

## フォルダ構成

```text
src/index.ts
.gitignore
README.md
package.json
tsconfig.json
wrangler.toml
```

## Current Features

- QQQの株価取得
- Cloudflare Cron Triggersによる定期実行
- Slack通知
- 環境変数によるAPIキー管理

## 実行結果サンプル

<img alt="Slackへ投稿された株価通知の実行結果サンプル" width="454" src="data:image/svg+xml;utf8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27454%27%20height=%27334%27%20viewBox=%270%200%20454%20334%27%3E%3Crect%20width=%27454%27%20height=%27334%27%20fill=%27%231a1d21%27/%3E%3Crect%20y=%2724%27%20width=%27454%27%20height=%27160%27%20fill=%27%2321262c%27/%3E%3Crect%20y=%27184%27%20width=%27454%27%20height=%27150%27%20fill=%27%231a1d21%27/%3E%3Cstyle%3E.name%7Bfont:700%2016px%20Arial,sans-serif;fill:white%7D.badge%7Bfont:700%2010px%20Arial,sans-serif;fill:white%7D.time%7Bfont:12px%20Arial,sans-serif;fill:%23c7d1db%7D.mention%7Bfont:700%2015px%20Arial,sans-serif;fill:%23f2c744%7D.text%7Bfont:15px%20Arial,sans-serif;fill:white%7D%3C/style%3E%3Cg%20transform=%27translate%2826%2031%29%27%3E%3Crect%20width=%2734%27%20height=%2736%27%20rx=%277%27%20fill=%27white%27/%3E%3Crect%20x=%278%27%20y=%275%27%20width=%2718%27%20height=%2726%27%20rx=%272%27%20fill=%27%232f80ed%27%20transform=%27rotate%28-9%2017%2018%29%27/%3E%3Crect%20x=%2711%27%20y=%277%27%20width=%2713%27%20height=%2722%27%20fill=%27%235aa8ff%27%20transform=%27rotate%28-9%2017%2018%29%27/%3E%3Cpath%20d=%27M31%2024l4%204-7%207%27%20stroke=%27%23f5a623%27%20stroke-width=%273%27%20fill=%27none%27/%3E%3C/g%3E%3Ctext%20x=%2769%27%20y=%2744%27%20class=%27name%27%3Estock-notify-bot%3C/text%3E%3Crect%20x=%27188%27%20y=%2733%27%20width=%2732%27%20height=%2714%27%20rx=%273%27%20fill=%27%232d3742%27/%3E%3Ctext%20x=%27193%27%20y=%2743%27%20class=%27badge%27%3E%E3%82%A2%E3%83%97%E3%83%AA%3C/text%3E%3Ctext%20x=%27228%27%20y=%2743%27%20class=%27time%27%3E07:00%3C/text%3E%3Ctext%20x=%2769%27%20y=%2766%27%20class=%27mention%27%3E%40channel%3C/text%3E%3Ctext%20x=%2769%27%20y=%2788%27%20class=%27text%27%3E%E9%8A%98%E6%9F%84%E3%82%B3%E3%83%BC%E3%83%89:%20QQQ%3C/text%3E%3Ctext%20x=%2769%27%20y=%27109%27%20class=%27text%27%3E%E7%8F%BE%E5%9C%A8%E4%BE%A1%E6%A0%BC:%20729.78003%3C/text%3E%3Ctext%20x=%2769%27%20y=%27130%27%20class=%27text%27%3E%E9%80%9A%E8%B2%A8:%20USD%3C/text%3E%3Ctext%20x=%2769%27%20y=%27151%27%20class=%27text%27%3E%E5%B8%82%E5%A0%B4%E7%8A%B6%E6%85%8B:%20CLOSED%3C/text%3E%3Ctext%20x=%2769%27%20y=%27172%27%20class=%27text%27%3E%E6%99%82%E5%88%BB%28ISO%29:%202026-06-16T13:30:00.000Z%3C/text%3E%3Cg%20transform=%27translate%2826%20193%29%27%3E%3Crect%20width=%2734%27%20height=%2736%27%20rx=%277%27%20fill=%27white%27/%3E%3Crect%20x=%278%27%20y=%275%27%20width=%2718%27%20height=%2726%27%20rx=%272%27%20fill=%27%232f80ed%27%20transform=%27rotate%28-9%2017%2018%29%27/%3E%3Crect%20x=%2711%27%20y=%277%27%20width=%2713%27%20height=%2722%27%20fill=%27%235aa8ff%27%20transform=%27rotate%28-9%2017%2018%29%27/%3E%3Cpath%20d=%27M31%2024l4%204-7%207%27%20stroke=%27%23f5a623%27%20stroke-width=%273%27%20fill=%27none%27/%3E%3C/g%3E%3Ctext%20x=%2769%27%20y=%27205%27%20class=%27name%27%3Estock-notify-bot%3C/text%3E%3Crect%20x=%27188%27%20y=%27194%27%20width=%2732%27%20height=%2714%27%20rx=%273%27%20fill=%27%232d3742%27/%3E%3Ctext%20x=%27193%27%20y=%27204%27%20class=%27badge%27%3E%E3%82%A2%E3%83%97%E3%83%AA%3C/text%3E%3Ctext%20x=%27228%27%20y=%27205%27%20class=%27time%27%3E23:00%3C/text%3E%3Ctext%20x=%2769%27%20y=%27227%27%20class=%27mention%27%3E%40channel%3C/text%3E%3Ctext%20x=%2769%27%20y=%27249%27%20class=%27text%27%3E%E9%8A%98%E6%9F%84%E3%82%B3%E3%83%BC%E3%83%89:%20QQQ%3C/text%3E%3Ctext%20x=%2769%27%20y=%27270%27%20class=%27text%27%3E%E7%8F%BE%E5%9C%A8%E4%BE%A1%E6%A0%BC:%20731.52%3C/text%3E%3Ctext%20x=%2769%27%20y=%27291%27%20class=%27text%27%3E%E9%80%9A%E8%B2%A8:%20USD%3C/text%3E%3Ctext%20x=%2769%27%20y=%27312%27%20class=%27text%27%3E%E5%B8%82%E5%A0%B4%E7%8A%B6%E6%85%8B:%20OPEN%3C/text%3E%3Ctext%20x=%2769%27%20y=%27333%27%20class=%27text%27%3E%E6%99%82%E5%88%BB%28ISO%29:%202026-06-17T13:30:00.000Z%3C/text%3E%3C/svg%3E" />

必要な環境変数:

- `SLACK_WEBHOOK_URL`
- `SLACK_TEST_TOKEN`
- `TWELVE_DATA_API_KEY`

Cloudflare Secret (初回設定例):

```bash
wrangler secret put TWELVE_DATA_API_KEY
```

## TODO

- 複数銘柄対応
- 通知条件のDB管理
- 取得履歴のD1保存
- 通知履歴の重複制御
