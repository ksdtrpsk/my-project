const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../server');
const http=require('node:http');
function fetch(url,options={}){return new Promise((resolve,reject)=>{const req=http.request(url,{method:options.method||'GET',headers:options.headers},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode}));});req.on('error',reject);req.end(options.body);});}
test('Vercel host serves frontend and accepts same-origin HTTPS API while rejecting cross-origin',async()=>{
 const old={VERCEL:process.env.VERCEL,VERCEL_URL:process.env.VERCEL_URL};
 process.env.VERCEL='1';process.env.VERCEL_URL='queue-test.vercel.app';
 const server=createServer({students:{findCredentials:async()=>null,findProfile:async()=>null}});
 try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 for(const path of ['/','/assets/styles.css','/assets/app.js']){const res=await fetch(base+path,{headers:{host:process.env.VERCEL_URL}});assert.equal(res.status,200);}
 const request=origin=>fetch(base+'/api/auth/login',{method:'POST',headers:{host:process.env.VERCEL_URL,origin,'content-type':'application/json'},body:JSON.stringify({student_code:'66309010001',password:'incorrect'})});
 assert.equal((await request('https://queue-test.vercel.app')).status,401);
 assert.equal((await request('https://other.example')).status,403);
 assert.equal((await fetch(base+'/',{headers:{host:'other.example'}})).status,403);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
