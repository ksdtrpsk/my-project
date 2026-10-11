const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseCsv,profileInput,passwordInput}=require('../student-csv');
const header='student_code,first_name,last_name,department_name,education_level_name,classroom_name,phone,email';
test('CSV preserves leading zeros, BOM, Thai, escaped quotes and commas',()=>{
 const [row]=parseCsv('\uFEFF'+header+'\r\n00123,"ชื่อ, \"\"เล่น\"\"",นามสกุล,ไอที,ปวส.2,2/1,,\r\n');
 assert.equal(row.student_code,'00123');assert.equal(row.first_name,'ชื่อ, "เล่น"');assert.deepEqual(row.errors,[]);assert.equal(row.phone,null);
});
test('CSV reports actual source lines after blanks and rejects multiline names per row',()=>{
 const rows=parseCsv(header+'\n\n001,"ชื่อ\nหลายบรรทัด",สกุล,ไอที,ปวส.2,1,,\n002,ชื่อ,สกุล,ไอที,ปวส.2,1,,');
 assert.equal(rows[0].row,3);assert.equal(rows[0].errors.length,1);assert.equal(rows[1].row,5);assert.equal(rows[1].errors.length,0);
});
test('CSV rejects malformed quoting, wrong headers, duplicate headers, empty and oversized files',()=>{
 for(const csv of ['',header,header+'\n1,"abc',header+'\n1,"a"x,b,c,d,e,,',header+'\n1,a"b,c,d,e,f,,','student_code,student_code\n1,2','password\nsecret','x'.repeat(204801)])assert.throws(()=>parseCsv(csv),e=>e.status===400);
});
test('CSV accepts 100 rows but rejects 101, reports column counts and invalid values',()=>{
 const rows=Array.from({length:100},(_,i)=>`${i},ชื่อ,สกุล,ไอที,ปวส.2,1,,`);
 assert.equal(parseCsv(header+'\n'+rows.join('\n')).length,100);
 assert.throws(()=>parseCsv(header+'\n'+[...rows,rows[0]].join('\n')),e=>e.status===400);
 for(const value of ['1,a','1e9,ชื่อ,สกุล,ไอที,ปวส.2,1,,','001,ชื่อ,สกุล,ไอที,ปวส.2,1,,wrong','001,ชื่อ,สกุล,ไอที,ปวส.2,1,abc,'])assert.equal(parseCsv(header+'\n'+value)[0].errors.length,1);
});
test('Student validation never coerces numeric codes or accepts short initial passwords',()=>{
 assert.throws(()=>profileInput({student_code:123,first_name:'ชื่อ',last_name:'สกุล'}));
 for(const value of ['short',' '.repeat(12),'x'.repeat(129),null])assert.throws(()=>passwordInput(value));
 assert.equal(passwordInput('Initial-123456'),'Initial-123456');
});
