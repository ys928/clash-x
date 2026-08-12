# Clash X

基于 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 的二次开发。

核心能力仍与上游保持同步，UI与交互全面重构，更现代、更美观：

## Preview

| Dark                             | Light                             |
| -------------------------------- | --------------------------------- |
| ![预览](https://github.com/user-attachments/assets/c73a2fc8-6815-4d85-8518-e45dd7f7b927) | ![预览](https://github.com/user-attachments/assets/66bbb081-c166-41be-b00f-e8cb4dc79976) |


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
