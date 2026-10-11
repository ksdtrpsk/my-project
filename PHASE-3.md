# Phase 3 — Student Login

ต่อจาก Phase 2 เดิม ไม่เปลี่ยนตารางหรือชื่อฟิลด์ และไม่เพิ่ม Booking ระบบใหม่นี้ต้องใช้ MySQL จริงเมื่อ npm start ไม่มีโหมดบัญชีจำลองที่เข้าสู่ระบบแทนฐานข้อมูลโดยอัตโนมัติ

## ทำอะไรแล้ว

- Login ด้วย student_code และ password ผ่าน POST /api/auth/login
- รหัสผ่านใน students.password เป็น scrypt hash พร้อม salt สุ่มแต่ละบัญชี ใช้ crypto ที่มากับ Node.js
- เก็บ Session ฝั่งเซิร์ฟเวอร์ โดย Cookie HttpOnly, SameSite=Strict มี token สุ่ม 32 bytes ไม่มีรหัสนักศึกษาหรือรหัสผ่านใน Cookie
- Session อายุคงที่ 60 นาที ปรับ SESSION_MINUTES ได้ ล้าง Session เก่าเมื่อ Login ใหม่ และทำลาย Session เมื่อ Logout
- Home และ Profile ใช้ชื่อ/กลุ่มจาก MySQL ตาม student_id ใน Session ไม่รับ student_id จากหน้าเว็บเพื่อเลือกบัญชีอื่น
- ดึงชื่อสาขา ระดับชั้น ห้องเรียน เบอร์โทร และอีเมลด้วย JOIN ตารางเดิม
- Student Home, My Booking, Book List, Profile ต้องมี Session ก่อนเปิดหน้า
- หน้า Admin และรายการหนังสือยังเป็น UI ตัวอย่าง ไม่มี Admin Login จริง ไม่มีการจองจริง
- ตรวจ JSON/ขนาดข้อมูล, ใช้ prepared statements, escape ข้อความก่อนแสดงใน HTML และจำกัด Login 10 ครั้งต่อ 15 นาทีต่อ IP

ใช้ HTTP server จาก Phase 1 เดิมและเพิ่ม module แยกตามหน้าที่ จึงยังไม่เปลี่ยนเป็น Express ใน Phase นี้ มี dependency เพิ่มเพียง mysql2 ส่วน password, session token และการทดสอบใช้ Node.js

## เตรียมเครื่องและฐานข้อมูล

1. ใช้ Node.js 22 ขึ้นไป และ MySQL 8.0.16 ขึ้นไปหรือ 8.4
2. เปิด Terminal ในโฟลเดอร์ book-queue
3. ติดตั้ง dependency:

```powershell
npm install
```

4. ถ้ายังไม่มีฐานข้อมูล ให้ทำตาม database/README.md จาก Phase 2 และรัน database/tests.sql ในฐานทดสอบให้ผ่านก่อน ห้าม import schema.sql ทับฐานที่สร้างไว้แล้ว
5. ครั้งแรกที่ยังไม่มี .env ให้คัดลอกไฟล์ตัวอย่าง:

```powershell
Copy-Item .env.example .env
```

6. เปิด .env และกำหนด DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME ให้ตรง MySQL ของคุณ ชื่อฐานเริ่มต้นคือ college_book_queue ใช้ค่า PORT=3000 เว้นแต่พอร์ตไม่ว่าง

ไฟล์ .env ถูกละเว้นใน Git และไม่ถูกส่งมอบใน ZIP อย่าส่งไฟล์ที่ใส่รหัสผ่านแล้วให้ผู้อื่น

## สร้างนักศึกษาสำหรับทดสอบครั้งแรก

เพิ่ม DEMO_STUDENT_PASSWORD ใน .env เป็นรหัสผ่านที่คุณเลือกเอง ยาว 12–128 ตัวอักษร แล้วรัน:

```powershell
npm run seed:student
```

ได้บัญชีรหัสนักศึกษา 66309010001 ชื่อสมชาย ใจดี สาขาเทคโนโลยีสารสนเทศ ระดับ ปวส.2 ห้อง ปวส.2/1 ใช้รหัสผ่านที่ตั้งเอง สคริปต์เก็บเฉพาะ hash ในฐานข้อมูลและไม่พิมพ์รหัสผ่านหรือ hash ออกหน้าจอ

สคริปต์สร้าง/ใช้สาขา ระดับ และห้องเดิมใน transaction ไม่สร้างหนังสือหรือคิว หากรหัสนักศึกษานี้มีอยู่แล้วจะหยุดโดยไม่เปลี่ยนข้อมูลหรือรหัสผ่านของบัญชีเดิม สามารถลบ DEMO_STUDENT_PASSWORD ออกจาก .env หลังทดสอบเสร็จ

ค่า TEST_ONLY_NOT_A_LOGIN_HASH ใน fixture ของ Phase 2 ไม่ใช่ hash สำหรับ Login และจะ Login ไม่ผ่าน ชุดทดสอบ Phase 2 ปกติ rollback fixture เหล่านั้นแล้ว

## เปิดระบบ

หากยังมีเซิร์ฟเวอร์ Phase 1/2 เปิดอยู่ ให้หยุดด้วย Ctrl+C ใน Terminal เดิมก่อน แล้วเริ่มใหม่เพื่อโหลดโค้ด backend Phase 3

```powershell
npm start
```

เปิด http://localhost:3000 หรือ http://127.0.0.1:3000 โดยใช้ hostname เดิมตลอดการทดสอบ เพราะ Cookie ของ localhost กับ 127.0.0.1 แยกกัน เซิร์ฟเวอร์รับเฉพาะ loopback บนเครื่องนี้

หากไม่พบ mysql2 ให้รัน npm install หากเชื่อม MySQL ไม่สำเร็จ เซิร์ฟเวอร์จะหยุดและแจ้งให้ตรวจ .env/schema โดยไม่แสดงข้อมูลบัญชีปลอมแทน

## วิธีทดสอบด้วยตนเอง

| ขั้นตอน | ผลที่ควรได้ |
| --- | --- |
| เปิด /profile.html โดยยังไม่ Login | กลับหน้า Login |
| กรอกรหัสนักศึกษาและรหัสผ่านถูกต้อง | ไป Home เห็นชื่อจากฐานข้อมูล |
| เปิด Profile | แสดง student_code, ชื่อ, สาขา, ระดับ, ห้อง, phone/email ของบัญชีที่ Login |
| Refresh หน้า Profile | ยัง Login อยู่ภายในอายุ Session |
| Logout | กลับหน้า Login และ Cookie หมดอายุ |
| เปิด Profile หลัง Logout หรือกดย้อนกลับ | ต้องตรวจ Session ใหม่และไม่แสดงข้อมูลบัญชีเดิม |
| กรอกรหัสผ่านผิด/รหัสนักศึกษาที่ไม่มี | ข้อความเดียวกันว่า รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง ไม่มี Session ใหม่ |
| ลองบัญชีต่างสาขาที่เตรียมไว้ในฐานข้อมูล | Profile แสดงกลุ่มของบัญชีนั้นเอง |
| หยุดและเริ่ม Node server ใหม่ | Session เดิมหมดไป ต้อง Login ใหม่ |
| เปิด Admin Login | ยังเป็นตัวอย่าง UI ไม่ส่งคำขอ Login นักศึกษา |

หลังทดสอบผิดครบ 10 ครั้งจาก IP เดียวต้องรอ 15 นาที หรือ restart เซิร์ฟเวอร์ทดสอบเพื่อเริ่มใหม่ ระบบนี้ยังเป็น localhost จึงเก็บตัวจำกัดจำนวนครั้งและ Session ในหน่วยความจำ

## ทดสอบอัตโนมัติ

```powershell
npm test
```

ชุดปกติใช้ HTTP server, Cookie, crypto และ handler จริง แต่จำลอง repository ที่อ่าน MySQL ส่วน UI ทดสอบด้วย DOM จำลอง ไม่ใช่เบราว์เซอร์จริง ชุดนี้รันได้โดยไม่ต้องมี MySQL และ mysql2 เพราะไม่ได้เปิด connection ฐานข้อมูล

เมื่อ MySQL และบัญชีทดสอบพร้อม ตั้ง DEMO_STUDENT_PASSWORD ให้ตรงกับบัญชีที่สร้าง แล้วรัน:

```powershell
$env:RUN_MYSQL_TESTS = '1'
npm test
Remove-Item Env:RUN_MYSQL_TESTS
```

กรณี Real MySQL ต้องผ่านโดยไม่ขึ้น SKIP ตรวจ hash และ JOIN Profile จากฐานจริง ชุดนี้อ่านบัญชีที่เตรียมไว้ ไม่ลบหรือสร้างข้อมูลฐานใหม่ ต้องทดสอบ flow ในเบราว์เซอร์ตามตารางด้วยก่อนถือว่าตรวจระบบครบ

## ข้อจำกัดและสถานะการตรวจ

ทดสอบอัตโนมัติผ่าน 15 กรณี และข้าม Real MySQL 1 กรณี ไม่มีกรณีล้มเหลว ขณะส่งมอบยังไม่มี MySQL/mysql2 ในสภาพแวดล้อม และการเข้าถึง npm registry ถูกปฏิเสธด้วย EACCES จึงยังยืนยันการเชื่อม MySQL จริงและผล SQL Phase 2 ไม่ได้

Session เก็บในหน่วยความจำ รองรับ Node process เดียวและหมดเมื่อ restart Cookie ไม่มี Secure เพราะใช้ HTTP บน localhost เมื่อทำระบบเผยแพร่จริงต้องใช้ HTTPS, Secure Cookie และ session store ที่เหมาะสม สิ่งเหล่านี้ยังไม่ใช่ deployment ใน Phase 3

อ้างอิงการใช้ [Node.js crypto](https://nodejs.org/api/crypto.html) และ [mysql2 Promise API](https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper)

## ไฟล์ที่เพิ่ม

- .env.example, .gitignore, PHASE-3.md, API-PHASE-3.md
- backend/config.js, passwords.js, sessions.js, students.js, auth.js
- backend/scripts/seed-student.js
- backend/tests/auth.test.js, frontend.test.js, mysql.integration.test.js

## ไฟล์ที่แก้

- package.json: version, dependency, Node requirement และคำสั่ง start/test/seed
- backend/server.js: เพิ่ม API, การตรวจ Session และเชื่อมฐานข้อมูล โดยคงการเสิร์ฟไฟล์เดิม
- frontend/assets/app.js: เพิ่ม Login/Logout, โหลด Profile และชื่อจาก API โดยคงหน้าและเมนูเดิม
- README.md: เพิ่มสถานะและลิงก์คู่มือ Phase 3

ไม่มีการเปลี่ยน schema.sql หรือเพิ่มตาราง ไม่มีการแก้ CSS และ HTML ทั้ง 7 หน้า โค้ดฉบับเต็มทุกไฟล์อยู่ใน PHASE-3-FULL-CODE.md ที่ส่งมอบคู่ ZIP

## Phase ต่อไป

Phase 4 จะทำระบบจัดการหนังสือและ Book Set หลังแก้ข้อจำกัดการทดสอบฐานจริงและตรวจ Phase 3 ผ่านแล้ว ขณะนี้หยุดที่ Phase 3 ไม่เริ่ม Phase 4 เอง
