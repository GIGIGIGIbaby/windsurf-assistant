# _dao_env.psd1 - WAM dao environment - soft config, no hardcode
#
# 道法自然 · 唯变所适 · 适配万法之用户万法之环境
#
# 何变此中: targets, extensionId, wamHomeDir, extDirHint
# 何不变: 本目录之 extension.js / package.json 即源
#
# 用户可
#   1. 直接编辑此文件
#   2. 设置环境变量 WAM_TARGETS_JSON (JSON array) 覆盖 targets
#   3. 部署/验证脚本传 -Targets 参数覆盖
#
# kind:
#   local   = $env:USERPROFILE on this machine
#   smb     = \\<host>\<drive>$\Users\<user>  (Windows admin share, fallback drive letter)
#   ssh     = ssh <user>@<host>  (reserved for future remote-exec mode)

@{
    extensionId = 'devaid.rt-flow'
    wamHomeDir  = '.wam'
    extDirHint  = '.windsurf\extensions'

    targets = @(
        @{ name = 'local'; kind = 'local' }
        @{
            name  = '179'
            kind  = 'smb'
            host  = '192.168.31.179'
            user  = 'zhouyoukang'
            drive = 'C'
        }
    )
}
