const {problem}=require('./errors');
const REQUIRED=['student_code','first_name','last_name','department_name','education_level_name','classroom_name'];
const OPTIONAL=['phone','email'];
function clean(value,label,max,required=true){
 if(value==null&&!required)return null;
 if(typeof value!=='string'||/[\u0000-\u001f\u007f\ufffd]/.test(value)||value.trim().length>max||(required&&!value.trim()))throw problem(400,label+' ไม่ถูกต้องหรือยาวเกิน '+max+' ตัวอักษร');
 return value.trim()||null;
}
function profileInput(body){
 const student_code=clean(body.student_code,'รหัสนักศึกษา',20);
 if(!/^\d{1,20}$/.test(student_code))throw problem(400,'รหัสนักศึกษาต้องเป็นตัวเลข 1–20 หลัก (เก็บเลขศูนย์นำหน้า)');
 const first_name=clean(body.first_name,'ชื่อ',100),last_name=clean(body.last_name,'นามสกุล',100);
 const phone=clean(body.phone,'โทรศัพท์',20,false),email=clean(body.email,'อีเมล',254,false);
 if(phone&&!/^[+0-9() -]+$/.test(phone))throw problem(400,'โทรศัพท์ใช้ตัวเลข + - วงเล็บและช่องว่าง');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw problem(400,'อีเมลไม่ถูกต้อง');
 return {student_code,first_name,last_name,phone,email};
}
function groupInput(body){return {department_name:clean(body.department_name,'สาขา',100),education_level_name:clean(body.education_level_name,'ระดับชั้น',30),classroom_name:clean(body.classroom_name,'ห้อง',30)};}
function passwordInput(password){if(typeof password!=='string'||password.length<6||password.length>128||!password.trim())throw problem(400,'รหัสผ่านเริ่มต้นต้องยาว 6–128 ตัวอักษร');return password;}
// Strict CSV state machine: supports BOM, CRLF, commas and escaped double quotes.
function parseCsv(source){
 if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>204800)throw problem(400,'CSV ต้องเป็น UTF-8 ขนาดไม่เกิน 200 KB');
 const text=source.replace(/^\uFEFF/,'');let rows=[],row=[],cell='',state='plain',line=1,startLine=1;
 function endCell(){row.push(cell);cell='';state='plain';}
 function endRow(){endCell();if(row.some(v=>v.trim()))rows.push({values:row,line:startLine});row=[];if(rows.length>101)throw problem(400,'นำเข้าได้ครั้งละไม่เกิน 100 คน');}
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(state==='quoted'){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else state='closed';}else {cell+=ch;if(ch==='\n'||(ch==='\r'&&text[i+1]!=='\n'))line++;}continue;}
  if(ch===','){endCell();continue;}
  if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;endRow();line++;startLine=line;continue;}
  if(state==='closed')throw problem(400,'CSV มีอักขระหลังเครื่องหมายปิดคำพูด');
  if(ch==='"'){if(cell)throw problem(400,'CSV วางเครื่องหมายคำพูดไม่ถูกต้อง');state='quoted';}else cell+=ch;
 }
 if(state==='quoted')throw problem(400,'CSV มีเครื่องหมายคำพูดที่ยังไม่ปิด');
 if(cell||row.length||state==='closed')endRow();
 if(rows.length<2)throw problem(400,'CSV ต้องมีหัวคอลัมน์และข้อมูลอย่างน้อย 1 คน');
 const headers=rows.shift().values.map(v=>v.trim());
 if(new Set(headers).size!==headers.length||REQUIRED.some(h=>!headers.includes(h))||headers.some(h=>![...REQUIRED,...OPTIONAL].includes(h)))throw problem(400,'หัวคอลัมน์ต้องเป็น '+[...REQUIRED,...OPTIONAL].join(', '));
 return rows.map(({values,line})=>{
  const item={row:line,student_code:values[headers.indexOf('student_code')]||'',errors:[]};
  try{
   if(values.length!==headers.length)throw problem(400,'จำนวนช่องไม่ตรงหัวคอลัมน์');
   const raw=Object.fromEntries(headers.map((key,j)=>[key,values[j]]));Object.assign(item,profileInput(raw),groupInput(raw));
  }catch(error){item.errors.push(error.message);}
  return item;
 });
}
module.exports={parseCsv,profileInput,groupInput,passwordInput};
