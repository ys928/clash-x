# Clash X

基于 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 的二次开发。

短期内核心能力（代理内核、系统代理、TUN、配置管理等）仍与上游保持同步；当前工作重心是**重构前端 UI 与交互**。

## Development

前置条件：已安装 [Tauri](https://tauri.app/) 所需环境。

```shell
pnpm i
pnpm run prebuild
pnpm dev
```

- `pnpm dev`：沿用当前开发通道的服务状态（已安装则用服务，未安装则以 Sidecar 启动）
- `pnpm dev:service`：安装/更新独立开发服务后再启动
- `pnpm dev:sidecar`：强制以无特权 Sidecar 模式启动

更多说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## Upstream

- 上游仓库：[clash-verge-rev/clash-verge-rev](https://github.com/clash-verge-rev/clash-verge-rev)
- 上游文档与发行版请参阅其 [README](https://github.com/clash-verge-rev/clash-verge-rev#readme) / [Releases](https://github.com/clash-verge-rev/clash-verge-rev/releases)

## License

GPL-3.0。详见 [LICENSE](./LICENSE)。
