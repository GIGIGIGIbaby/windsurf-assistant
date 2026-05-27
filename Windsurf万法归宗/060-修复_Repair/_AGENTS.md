# Windsurf Remote Repair

双机(Desktop-141+Laptop-179) Windsurf维护中枢。统一入口`windsurf-agent.ps1`。

## 命令

- `status` — 健康检查(进程/认证/补丁/网络/磁盘)
- `fix` — 一键修复(杀进程→清缓存→修设置→重认证→打补丁→验连通)
- `patch` — Continue/RateLimit/Workbench补丁(需Python)
- `guard` — 安全审计(hosts/防火墙/端口/RAM/磁盘)
- `deploy -Remote` — 推送工具包到远端`C:\Tools\WindsurfAgent\`
- 加`-Remote`操作对端(WinRM自动探测) · 加`-Json`结构化输出

## 约束

- 先status再修复 · fix会杀Windsurf(用户需重登录)
- patch需Python脚本 · -Remote自动部署 · 凭据走secrets.env
