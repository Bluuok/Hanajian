# TraceDigest Windows 发布说明

## 本机构建

建议使用项目锁定的 pnpm 版本：

```powershell
cd E:\zzzz\TraceDigest
npx --yes pnpm@7.33.7 install
npx --yes pnpm@7.33.7 build:win
```

安装包生成在 `dist/`，版本号来自 `package.json`。`dist/`、`.electron-cache/` 和 `.electron-builder-cache/` 已被 Git 忽略，不要提交构建缓存。

当前首版关闭了自动更新，也没有配置 Windows 代码签名。用户需要从 GitHub Releases 手动下载安装，新电脑首次运行可能出现 SmartScreen 提示。

## 独立仓库与发布

项目唯一维护仓库为 `Bluuok/TraceDigest`，主分支为 `main`。`origin` 只指向自己的仓库，不配置原作者远程，也不从原仓库拉取更新。首次检出自己的项目时：

```powershell
git clone https://github.com/Bluuok/TraceDigest.git
cd TraceDigest
git switch main
gh repo set-default Bluuok/TraceDigest
```

发布前运行测试、递增 `package.json` 版本并提交到自己的 `main`，然后创建与版本匹配的 `v<version>` 标签。推送标签后，由本仓库的 `Release Windows` 工作流构建安装包并发布到自己的 GitHub Releases；也可手动上传已验证的安装包和校验和。不要复用旧版本标签。

安装包标识为 `io.github.bluuok.tracedigest`，发布配置及下载链接均指向自己的仓库。标识已与旧安装包区分，升级时需验证快捷方式和卸载项；不要删除用户数据来解决旧安装残留。未发布新安装包前，已安装的旧版本不会自动改用新链接。

发布说明中保留项目基于 TraceMemo 非商业二次开发、自动更新关闭、安装包未签名的说明，并链接 `NOTICE-TRACEDIGEST.md`。来源与许可证声明用于记录授权要求，不表示与原仓库保持同步。

不要提交 `.env`、API Key、微信数据库、解密密钥、机器人凭据或用户聊天导出文件。
