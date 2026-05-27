# Agent Remote Repair

远程电脑诊断修复。WebSocket远程中枢 + PowerShell守护 + 硬件排查知识库。

- `desktop_guardian.ps1` — 23项诊断/14项修复/hosts守护
- `remote-agent/server.js` — WS远程中枢 · `brain.js auto` — CLI自动诊断
- 诊断优先于修复 · hosts-guard持续运行 · 远程中枢需管理员权限
