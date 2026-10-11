# Phase 17 — Final Testing

ทดสอบ User Flow ทั้ง 6 Scenario ตามข้อกำหนด โดยใช้ MySQL จริงและ HTTP API ของระบบต่อเนื่องกัน พร้อมตรวจเส้นทางหลักใน browser ใช้โค้ด Phase 16 เดิม ไม่มีการเปลี่ยนกฎ Booking, QR, My Booking หรือ Admin ใน Phase นี้ ยังไม่เริ่ม Phase 18 และ Phase 10 ถูกตัดออกตามเดิม

## ผลรวม

**192 tests ผ่าน 192, fail 0, skipped 0** รันยืนยันครั้งสุดท้ายวันที่ 19 กันยายน 2569 ด้วย RUN_MYSQL_TESTS=1 ดูรายละเอียดใน TEST-RESULTS-PHASE-17.md

เพิ่ม backend/tests/phase17.mysql.test.js เพื่อทดสอบการทำงานเชื่อมกันจากการล็อกอินจริงผ่าน HTTP สร้างข้อมูลหนังสือ/ชุด/รอบผ่าน Admin API และถอดภาพ QR จริงจาก Student API ก่อนส่งเข้า Pickup API หลังจบตรวจข้อมูล My Booking, Dashboard, Report และ CSV ว่าสอดคล้องกับฐานข้อมูล

ไม่มี defect ที่ต้องแก้ในฟังก์ชันใช้งานจากกรณีที่ทดสอบ เพิ่มชุดทดสอบและเอกสารผล พร้อมปรับเลขรุ่นเป็น 17.0.0 และ footer เป็น Phase 17

## วิธีรันระบบ

เปิด PowerShell ในโฟลเดอร์โปรเจ็กต์ หยุด server เดิมด้วย Ctrl+C แล้วรัน:

```powershell
cd "C:\Users\KSD\Documents\Codex\2026-09-11\files-pasted-by-the-user-web\outputs\book-queue"
npm start
```

เปิด http://localhost:3000/ หรือ http://localhost:3000/admin-login.html ใช้บัญชีและรหัสผ่านเดิม ไม่มี migration หรือ dependency ใหม่ ไม่ต้อง import/seed ซ้ำ

## วิธีรันทดสอบทั้งหมด

```powershell
$env:RUN_MYSQL_TESTS='1'
try { npm test } finally { Remove-Item Env:RUN_MYSQL_TESTS -ErrorAction SilentlyContinue }
```

ทดสอบเฉพาะ Scenario Phase 17:

```powershell
$env:RUN_MYSQL_TESTS='1'
try { node --test backend/tests/phase17.mysql.test.js } finally { Remove-Item Env:RUN_MYSQL_TESTS -ErrorAction SilentlyContinue }
```

บัญชี MySQL ใน .env ต้องมีสิทธิ์ CREATE/DROP DATABASE สำหรับฐานทดสอบ ชุดทดสอบใช้ชื่อฐานสุ่มแยกจาก DB_NAME และล้างใน finally หลังจบ ไม่แก้ข้อมูลในฐานใช้งานจริง หากไม่ได้ตั้ง RUN_MYSQL_TESTS integration tests จะขึ้น skipped ซึ่งไม่ใช่หลักฐานว่าทดสอบ MySQL ผ่าน

เวลาทดสอบถูกกำหนดเป็น 2030-01-01 และวันนัดเป็น 2031-09-15 เพื่อให้กรณีวันอนาคตและยกเลิกก่อนเริ่มรอบทดสอบซ้ำได้ ค่าเวลานี้ใช้เฉพาะ fixture ไม่เปลี่ยนเวลาของระบบจริง

## ตรวจด้วยตนเอง

ใช้บัญชีและข้อมูลทดสอบที่แยกจากการใช้งานจริง: เตรียมนักศึกษา 2 สาขา ชุดหนังสือของแต่ละกลุ่ม และรอบที่รับได้ 1 คน จากนั้นทำตามตาราง Scenario ใน TEST-RESULTS-PHASE-17.md

Browser ตรวจเส้นทาง Student Login → ดูหนังสือ → เลือกรอบ → ยืนยัน Booking → แสดง QR → Admin Login → เลือกภาพ QR → ตรวจชื่อ/หนังสือ → ยืนยันรับ → โหลดหน้าสแกนใหม่และอ่านภาพเดิมซ้ำ พบข้อความรับแล้วและปุ่มยืนยัน disabled

การตรวจ browser ใช้วิธีเลือกภาพ QR จริง ไม่ได้เปิดกล้องจริงในเครื่องนี้ ส่วนการเริ่ม/หยุด stream และกรณีปฏิเสธกล้องมี automated tests เดิมรองรับ หากสาธิตด้วยเว็บแคมควรทดลองกับอุปกรณ์ที่จะใช้จริงก่อนวันนำเสนอ

## ไฟล์ส่งมอบ

เพิ่ม backend/tests/phase17.mysql.test.js, PHASE-17.md และ TEST-RESULTS-PHASE-17.md

แก้ package.json/package-lock.json, frontend/assets/app.js เฉพาะเลข Phase, README.md และ PROJECT-SCOPE.md

โค้ดเต็ม ../PHASE-17-FULL-CODE.md และ ZIP ../book-queue-phase-17.zip ไม่รวม .env, node_modules หรือ .git เอกสารสรุปโครงงาน Phase 18 ยังไม่ได้เริ่ม
