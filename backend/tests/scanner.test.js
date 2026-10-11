const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const { PNG }=require('pngjs');
const jsQR=require('jsqr');
const { qrPng,newQrToken }=require('../qr');
const source=fs.readFileSync(path.resolve(__dirname,'../../frontend/assets/scanner-ui.js'),'utf8');
const token='BQ1:'+'A'.repeat(64);
const receipt={booking_id:1,student_code:'900010',first_name:'ทดสอบ <img>',last_name:'หนึ่ง',department_name:'ไอที',education_level_name:'ปวส.1',classroom_name:'1/1',queue_number:'A001',booking_status:'WAITING',received_at:null,booking_date:'2031-09-15',start_time:'09:00',end_time:'09:30',semester:1,academic_year:2574,books:[{book_name:'เว็บไซต์'}]};
function screen(handler,extra={}){
  const nodes=new Map(),calls=[];
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,hidden:false,addEventListener(type,callback){this[type]=callback;}});return nodes.get(id);}
  const context=vm.createContext({setTimeout,clearTimeout,page:'admin-scanner',navigator:{},window:{addEventListener(){},location:{replace(){}}},document:{getElementById:node,addEventListener(){}},escapeHtml:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),slotPeriod:r=>r.booking_date+' '+r.start_time,bookRows:books=>books.map(b=>b.book_name).join(','),api:async(url,body)=>{calls.push({url,body});return handler?handler(url,body):{booking:receipt};},...extra});
  vm.runInContext(source,context);return {node,calls,run:s=>vm.runInContext(s,context),context};
}
test('Scanner lookup displays escaped details and never auto-confirms; repeated confirm clicks send once',async()=>{
  const ui=screen(url=>({booking:url.endsWith('/confirm')?{...receipt,booking_status:'RECEIVED',received_at:'2030-01-01 09:00:00'}:receipt}));
  await ui.run(`scanToken('${token}')`);assert.equal(ui.calls.length,1);assert.match(ui.calls[0].url,/lookup$/);
  assert.match(ui.node('scanner-result').innerHTML,/&lt;img&gt;/);assert.match(ui.node('scanner-result').innerHTML,/900010/);
  const pending=ui.run('confirmPickup()');await ui.run('confirmPickup()');await pending;
  assert.equal(ui.calls.filter(c=>c.url.endsWith('/confirm')).length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls[1].body)),{booking_id:1,token});
  assert.match(ui.node('scanner-result').innerHTML,/รายการนี้รับหนังสือแล้ว/);assert.equal(ui.node('scanner-message').textContent,'ยืนยันรับหนังสือสำเร็จ');
});
test('Invalid next QR clears prior result and cannot confirm the previous student',async()=>{
  const ui=screen();await ui.run(`scanToken('${token}')`);await ui.run("scanToken('https://example.org')");
  assert.equal(ui.node('scanner-result').innerHTML,'');await ui.run('confirmPickup()');assert.equal(ui.calls.length,1);
  assert.match(ui.node('scanner-message').textContent,/ไม่ใช่รูปแบบ/);
});
test('Lost confirmation response recovers RECEIVED by lookup without duplicate mutation',async()=>{
  let saved=false;
  const ui=screen(url=>{if(url.endsWith('/confirm')){saved=true;throw Error('Lost response');}return {booking:saved?{...receipt,booking_status:'RECEIVED',received_at:'2030-01-01 09:00:00'}:receipt};});
  await ui.run(`scanToken('${token}')`);await ui.run('confirmPickup()');
  assert.match(ui.node('scanner-message').textContent,/รายการนี้รับหนังสือแล้ว/);assert.equal(ui.calls.filter(c=>c.url.endsWith('/confirm')).length,1);
});
test('Denied or cancelled camera requests show fallback and stop a late stream',async()=>{
  const denied=screen(null,{navigator:{mediaDevices:{getUserMedia:async()=>{throw Object.assign(Error(),{name:'NotAllowedError'});}}}});
  await denied.run('startScannerCamera()');assert.match(denied.node('scanner-message').textContent,/ไม่ได้รับสิทธิ์กล้อง/);
  let deliver,stopped=0;
  const late=screen(null,{navigator:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{deliver=resolve;})}}});
  const pending=late.run('startScannerCamera()');late.run('stopScannerCamera()');deliver({getTracks:()=>[{stop(){stopped++;}}]});await pending;
  assert.equal(stopped,1);assert.equal(late.run('scannerState.stream'),null);
});
test('Image scanner decodes a real QR image locally and sends only its token',async()=>{
  const actualToken=newQrToken(),png=PNG.sync.read(await qrPng(actualToken));let closed=false;
  const ui=screen(null,{jsQR,createImageBitmap:async()=>({width:png.width,height:png.height,close(){closed=true;}})});
  ui.context.document.createElement=()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({width:png.width,height:png.height,data:new Uint8ClampedArray(png.data)})})});
  await ui.run("scanImageFile({type:'image/png',size:1000})");
  assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].body.token,actualToken);assert.equal(closed,true);
  await ui.run("scanImageFile({type:'text/plain',size:100})");assert.equal(ui.node('scanner-result').innerHTML,'');assert.equal(ui.calls.length,1);
});
test('Camera frame decoding stops tracks on QR detection before read-only lookup',async()=>{
  const ui=screen(null,{navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){ui.stopped=true;}}]})}}});
  const video=ui.node('scanner-video');video.play=async()=>{};video.readyState=2;video.videoWidth=100;video.videoHeight=100;
  ui.run(`decodeScannerImage=()=> '${token}'`);await ui.run('startScannerCamera()');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.stopped,true);assert.equal(ui.calls.length,1);assert.match(ui.calls[0].url,/lookup$/);assert.equal(ui.run('scannerState.stream'),null);
});
