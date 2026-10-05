# 花笺 Hanajian Windows 构建与发布

## 本机构建

使用 Node.js 24 和项目锁定的 pnpm 7.33.7：

```powershell
cd E:\zzzz\Hanajian
pnpm install --frozen-lockfile
pnpm build:win
```

安装包为 `dist/hanajian-<version>-setup.exe`，可执行文件为 `Hanajian.exe`；版本来自 `package.json`。`build:win` 显式使用 `--publish never`，本地构建不发布。

依赖安装在项目根目录进行，不要求预先生成编译产物。打包脚本在 `.tmp-test-artifacts/hanajian-package-stage` 准备编译产物与运行依赖，并仅在打包命令中通过 `--config.directories.app=.tmp-test-artifacts/hanajian-package-stage` 指定应用目录。stage 不复制根目录源码、`.env*` 或用户数据。直接调用 electron-builder 前需先运行 `node scripts/prepare-package-stage.cjs`，并传入上述应用目录参数。

应用关闭自动更新，Windows 安装包未配置签名。下载页、更新 provider 与发布目标均配置为 `Bluuok/Hanajian`。这些是本地配置，不表示新版已经发布或远程验证通过。

## 明确确认后发布

维护仓库为 `https://github.com/Bluuok/Hanajian`，主分支为 `main`：

```powershell
git clone https://github.com/Bluuok/Hanajian.git
cd Hanajian
git switch main
```

发布前审查改动、完成本地验证、递增版本，并按授权提交和推送代码以及对应的 `v<version>` 标签。标签推送不会自动发布。需要发布时，在本仓库 Actions → Release Windows 手动选择已有版本标签，并明确勾选 `confirm_publish`；未确认或在其他仓库运行时，发布 job 不执行。工作流验证版本后构建安装包、生成校验和并创建 GitHub Release。

## 兼容与来源

保留安装标识 `io.github.bluuok.tracedigest`、历史 userData/runtime 名称和加密身份，避免破坏已有安装及安全存储。展示名、包名和文件名采用花笺/Hanajian；这些兼容标识不是遗漏。新导出默认写入 `文稿/Hanajian/导出`；已有 TraceDigest/WechatExplorer 增量导出继续在原目录追加，不移动或覆盖。

来源、非商业使用边界与第三方声明完整保存在 [NOTICE.md](NOTICE.md)。不要提交真实 `.env*`、API Key、微信数据库、解密密钥、机器人凭据、聊天导出或构建缓存。其他平台的打包、签名和真实账户集成需要单独验证。
