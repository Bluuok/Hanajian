#!/bin/bash

# 获取当前版本号（从 package.json 读取）
VERSION=$(jq -r '.version' package.json)

# 格式化为新的 tag（在版本号前加上 "v"）
TAG="v${VERSION}"

# 输出当前生成的 tag
echo "生成的 tag: $TAG"

# 创建并推送 tag 到远程
git tag $TAG
git push origin $TAG

echo "Tag $TAG 已经推送到远程仓库!"
