"""
Windsurf 全文件恢复工具 v2.0
=============================
恢复所有被patch修改的文件到原始状态。
支持两种备份源:
  1. _windsurf_backups/ 目录下的时间戳备份(patch脚本自动创建)
  2. 文件旁的 .bak 后缀备份

被patch的3个文件:
  - workbench.desktop.main.js (P2/P4/P6/P7/GBe)
  - extension.js (P1/P5/P8/P9)
  - @exa/chat-client/index.js (P3)
"""
import os, shutil, json
from pathlib import Path
from datetime import datetime

def _find_windsurf():
    """Auto-detect Windsurf installation."""
    candidates = [
        Path(r"D:\Windsurf\resources\app"),
        Path(r"E:\Windsurf\resources\app"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Windsurf" / "resources" / "app",
        Path(r"C:\Program Files\Windsurf\resources\app"),
    ]
    for c in candidates:
        if c.exists() and (c / "package.json").exists():
            return c
    return None

def restore_all():
    print("=" * 55)
    print("  Windsurf 全文件恢复工具 v2.0")
    print("=" * 55)

    ws = _find_windsurf()
    if not ws:
        print("[!] 未找到 Windsurf 安装")
        return False

    print(f"[*] Windsurf: {ws.parent.parent}")

    targets = {
        "workbench": ws / "out" / "vs" / "workbench" / "workbench.desktop.main.js",
        "extension": ws / "extensions" / "windsurf" / "dist" / "extension.js",
        "chat_client": ws / "node_modules" / "@exa" / "chat-client" / "index.js",
    }

    # 查找备份目录(脚本同目录或Windsurf无限额度目录)
    backup_dirs = [
        Path(__file__).parent / "_windsurf_backups",
    ]

    restored = 0
    for name, target in targets.items():
        if not target.exists():
            print(f"  [-] {name}: 文件不存在, 跳过")
            continue

        # 策略1: 从 _windsurf_backups 找最早的备份(=原始文件)
        bak_found = None
        for bd in backup_dirs:
            if bd.exists():
                # 找该文件名的所有备份, 取最早的(最可能是原始)
                baks = sorted(bd.glob(f"{target.name}.*.bak"))
                if baks:
                    bak_found = baks[0]  # 最早 = 原始
                    break

        # 策略2: 文件旁的 .bak
        if not bak_found:
            side_bak = Path(str(target) + ".bak")
            if side_bak.exists():
                bak_found = side_bak

        if bak_found:
            shutil.copy2(bak_found, target)
            print(f"  [OK] {name}: 已从 {bak_found.name} 恢复 ({bak_found.stat().st_size:,}B)")
            restored += 1
        else:
            print(f"  [!] {name}: 无备份可用")

    # 恢复 product.json 校验和
    product_json = ws / "product.json"
    if product_json.exists() and restored > 0:
        try:
            import hashlib, base64
            wb = targets["workbench"]
            if wb.exists():
                h = hashlib.sha256()
                with open(wb, "rb") as f:
                    for chunk in iter(lambda: f.read(65536), b""):
                        h.update(chunk)
                checksum = base64.b64encode(h.digest()).decode("ascii").rstrip("=")
                product = json.loads(product_json.read_text(encoding="utf-8"))
                if "checksums" in product:
                    product["checksums"]["vs/workbench/workbench.desktop.main.js"] = checksum
                    product_json.write_text(json.dumps(product, indent="\t"), encoding="utf-8")
                    print(f"  [OK] product.json 校验和已更新")
        except Exception as e:
            print(f"  [!] product.json 校验和更新失败: {e}")

    print(f"\n恢复完成: {restored}/{len(targets)} 文件")
    if restored > 0:
        print("请 Ctrl+Shift+P → Reload Window 或重启 Windsurf 生效")
    return restored > 0

if __name__ == "__main__":
    restore_all()
