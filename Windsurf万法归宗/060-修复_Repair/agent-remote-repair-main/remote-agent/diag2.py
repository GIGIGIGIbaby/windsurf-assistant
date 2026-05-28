import json,sqlite3,shutil,os
db=os.path.join(os.environ["APPDATA"],"Windsurf","User","globalStorage","state.vscdb")
tmp=db+".vtmp"
shutil.copy2(db,tmp)
c=sqlite3.connect(tmp)
r1=c.execute("SELECT value FROM ItemTable WHERE key=?", ("codeium.windsurf-windsurf_auth",)).fetchone()
r2=c.execute("SELECT value FROM ItemTable WHERE key LIKE ?", ("%windsurf_auth.sessions%",)).fetchone()
c.close()
os.unlink(tmp)
print("display:", r1[0] if r1 else "NONE")
print("blob:", len(r2[0]) if r2 else "NONE")
