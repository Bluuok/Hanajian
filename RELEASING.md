# TraceDigest Windows 发布说明

## 本机构建

建议使用项目锁定的 pnpm 版本：

```powershell
cd D:\二开tracememo
npx --yes pnpm@7.33.7 install
npx --yes pnpm@7.33.7 build:win
```

安装包生成在 `dist/TraceDigest-0.1.0-setup.exe`。`dist/`、`.electron-cache/` 和 `.electron-builder-cache/` 已被 Git 忽略，不要提交构建缓存。

当前首版关闭了自动更新，也没有配置 Windows 代码签名。用户需要从 GitHub Releases 手动下载安装，新电脑首次运行可能出现 SmartScreen 提示。

## GitHub 首次发布

1. 在 GitHub 的 `gmll-star` 账号下创建空仓库 `TraceDigest`，不要勾选自动创建 README、LICENSE 或 `.gitignore`。
2. 保留原上游远程用于后续对照，并把自己的仓库设为新的 `origin`：

```powershell
git remote rename origin upstream
git remote add origin https://github.com/gmll-star/TraceDigest.git
git push -u origin HEAD:main
```

3. 在 GitHub 创建标签 `v0.1.0` 和对应 Release，上传 `dist/TraceDigest-0.1.0-setup.exe`。
4. 发布说明中明确写明：项目基于 TraceMemo 非商业二次开发、自动更新关闭、安装包未签名，并链接 `NOTICE-TRACEDIGEST.md`。

不要提交 `.env`、API Key、微信数据库、解密密钥、机器人凭据或用户聊天导出文件。
