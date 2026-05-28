import json, os

settings_path = r"C:\Users\Administrator\AppData\Roaming\Windsurf\User\settings.json"

# Read existing settings (if valid JSON)
try:
    with open(settings_path, "r", encoding="utf-8") as f:
        settings = json.load(f)
except:
    settings = {}

# Add proxy config
settings["http.proxy"] = "http://127.0.0.1:7897"
settings["http.proxyStrictSSL"] = False

with open(settings_path, "w", encoding="utf-8") as f:
    json.dump(settings, f, indent=4, ensure_ascii=False)

print("settings.json updated:")
print(json.dumps(settings, indent=4))
