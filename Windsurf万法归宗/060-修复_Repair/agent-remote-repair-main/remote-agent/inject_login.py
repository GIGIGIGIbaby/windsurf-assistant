import os, sys, json, sqlite3, urllib.request, uuid, base64

# Add scripts dir to path to import session_helper
sys.path.append(os.path.join(os.path.dirname(__file__), 'scripts'))
try:
    import session_helper
except ImportError:
    print("Failed to import session_helper")
    sys.exit(1)

EMAIL = "bhattjdlu98974@yahoo.com"
PASSWORD = "Nps#lKuJ6gSY"
FIREBASE_KEY = "AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY"

def firebase_login(email, password):
    # Try using local proxy 7890 for Firebase if needed
    proxy_handler = urllib.request.ProxyHandler({
        'http': 'http://127.0.0.1:7890',
        'https': 'http://127.0.0.1:7890'
    })
    opener = urllib.request.build_opener(proxy_handler)
    urllib.request.install_opener(opener)

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}"
    payload = json.dumps({
        "email": email,
        "password": password,
        "returnSecureToken": True
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Firebase login failed: {e.read().decode()}")
        return None

def inject_session(email, uid, id_token, refresh_token):
    # Construct the session JSON
    session_id = str(uuid.uuid4())
    sessions = [{
        "id": session_id,
        "account": {
            "label": email,
            "id": uid
        },
        "scopes": [],
        "idToken": id_token,
        "refreshToken": refresh_token
    }]
    plain_json = json.dumps(sessions).encode('utf-8')
    print(f"Session JSON created, length: {len(plain_json)}")

    # Get Paths
    user = os.environ.get('USERNAME', 'Administrator')
    db_path = rf'C:\Users\{user}\AppData\Roaming\Windsurf\User\globalStorage\state.vscdb'
    ls_path = rf'C:\Users\{user}\AppData\Roaming\Windsurf\Local State'

    if not os.path.exists(db_path):
        print(f"DB not found: {db_path}")
        return False

    # Encrypt
    encrypted_blob = None
    if os.path.exists(ls_path):
        print("Found Local State, trying Chromium v10 encryption...")
        key = session_helper.get_chromium_key(ls_path)
        if key:
            encrypted_blob = session_helper.v10_encrypt(plain_json, key)
            print("Encrypted using Chromium v10 AES-GCM.")
        else:
            print("Failed to get Chromium key.")
            
    if not encrypted_blob:
        print("Falling back to pure DPAPI encryption...")
        encrypted_blob = session_helper.dpapi_encrypt(plain_json)
        
    # Format for state.vscdb
    # It must be a JSON string of a Buffer object?
    # No, session_helper.py says:
    # "buffer object" like {"type": "Buffer", "data": [...]} OR raw string?
    # Wait, in state.vscdb, it's stored as a stringified JSON of the Buffer.
    # Let's use session_helper.bytes_to_buf
    db_value = session_helper.bytes_to_buf(encrypted_blob)
    
    # Write to DB
    SESSION_KEY = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}'
    
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)', (SESSION_KEY, db_value))
    
    # Also set active account
    ACTIVE_KEY = 'codeium.windsurf-windsurf_auth'
    # The active account value is usually the display name or just the email.
    # Windsurf uses the `account.label` (which is the email).
    # Wait, active key value is a string, but it's JSON encoded string?
    # usually it's just the plain string but json encoded: '"email@example.com"'
    c.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)', (ACTIVE_KEY, f'"{email}"'))
    
    conn.commit()
    conn.close()
    print("Successfully injected session into state.vscdb!")
    return True

def main():
    print(f"Logging in to Firebase as {EMAIL}...")
    auth_data = firebase_login(EMAIL, PASSWORD)
    if not auth_data:
        sys.exit(1)
        
    uid = auth_data['localId']
    id_token = auth_data['idToken']
    refresh_token = auth_data['refreshToken']
    
    print(f"Login successful! UID: {uid}")
    
    if inject_session(EMAIL, uid, id_token, refresh_token):
        print("Injection complete. You can now start Windsurf.")
    else:
        print("Injection failed.")

if __name__ == "__main__":
    main()
