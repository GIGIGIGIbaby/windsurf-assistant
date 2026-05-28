const{execSync}=require("child_process");
const db="C:\\Users\\zhouyoukang\\AppData\\Roaming\\Windsurf\\User\\globalStorage\\state.vscdb";
function q(key){try{return execSync(`sqlite3 "${db}" "SELECT value FROM ItemTable WHERE key='${key}'"`,{encoding:"utf8"}).trim()}catch{return""}}
const key=q("codeium.apiKey");
const csrf=q("codeium.csrfToken");
console.log("KEY="+key);
console.log("CSRF="+csrf);
// Also find LS ports by probing
const http=require("http");
async function probe(port,tok){return new Promise(r=>{const req=http.request({hostname:"127.0.0.1",port,path:"/exa.language_server_pb.LanguageServerService/Ping",method:"POST",headers:{"content-type":"application/json","connect-protocol-version":"1","x-codeium-csrf-token":tok,"content-length":2},timeout:3000},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>r({port,status:res.statusCode,body:d.slice(0,100)}))});req.on("error",()=>r({port,status:0}));req.on("timeout",()=>{req.destroy();r({port,status:0})});req.write("{}");req.end()})}
(async()=>{
  // Probe known LS ports
  const ports=[32643,32652,32654,32657,11636];
  const tokens=[csrf,"de791658-5ff6-4025-a96d-4795cec39129"];
  for(const p of ports){
    for(const t of tokens){
      if(!t)continue;
      const r=await probe(p,t);
      if(r.status===200){console.log(`LS_OK port=${p} csrf=${t.slice(0,12)}...`)}
      else if(r.status>0){console.log(`LS_REJECT port=${p} csrf=${t.slice(0,12)}... status=${r.status} body=${r.body}`)}
    }
  }
})();
