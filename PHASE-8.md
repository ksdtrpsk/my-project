# Phase 8 — สแกน QR และยืนยันรับหนังสือ

Phase 8 เสร็จแล้ว ต่อจาก Phase 7 เดิม เจ้าหน้าที่สแกน QR ดูรายละเอียด และกดยืนยันรับหนังสือ ระบบบันทึก RECEIVED พร้อมเวลารับ และป้องกันการรับซ้ำ ยังไม่เริ่ม Phase 9

## วิธีรันต่อจาก Phase 7

เปิด PowerShell ในโฟลเดอร์ `outputs/book-queue` หยุด server เดิมด้วย Ctrl+C แล้วรัน:

```powershell
npm ci
npm run migrate:phase8
npm start
```

ใช้ Node.js 22 ขึ้นไป และ MySQL พร้อม `.env` เดิม เครื่องที่พัฒนาอยู่นี้ติดตั้ง dependency และ migrate แล้ว ไม่ต้อง import schema หรือ seed บัญชีซ้ำ อย่าคัดลอก `.env.example` ทับ `.env` เดิม

Migration เพิ่ม `bookings.received_at DATETIME NULL DEFAULT NULL` โดยรักษาข้อมูลเดิม รันซ้ำได้ หากมีคอลัมน์ชนิดไม่ตรงจะหยุดให้ตรวจสอบ ไม่สร้างเวลารับสมมติให้รายการเก่า เครื่องใหม่ใช้ schema ล่าสุดและขั้นตอนตั้งค่าบัญชีใน PHASE-3.md และ PHASE-4.md

เปิด http://localhost:3000/admin-login.html เข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่เดิม แล้วเลือก “สแกนรับหนังสือ” หรือเปิด http://localhost:3000/admin-scanner.html

## วิธีใช้งาน

1. นักศึกษาเปิด “การจองของฉัน” และแสดง QR หรือบันทึกภาพจาก Phase 7
2. เจ้าหน้าที่กดเปิดกล้องและอนุญาตการใช้กล้อง หรือเลือกไฟล์ภาพ QR หรือวาง token จาก QR
3. ตรวจชื่อ รหัสนักศึกษา สาขา ระดับชั้น ห้อง รายการหนังสือ วัน เวลา เลขคิว และสถานะให้ตรงกับผู้รับ
4. ส่งมอบหนังสือแล้วกด “ยืนยันรับหนังสือ” ระบบเปลี่ยนสถานะเป็น RECEIVED และแสดงเวลารับตามประเทศไทย
5. สแกนซ้ำจะแสดง “รายการนี้รับหนังสือแล้ว” ปุ่มยืนยันใช้ไม่ได้ และเวลารับเดิมไม่เปลี่ยน

การสแกนเพียงอย่างเดียวเป็นการอ่านข้อมูล ไม่มีการยืนยันอัตโนมัติ ยืนยันได้เฉพาะ WAITING หรือ CHECKED_IN และยังไม่มีเวลารับ ส่วน CANCELLED และ NO_SHOW ยืนยันไม่ได้ ปัจจุบันไม่ได้บังคับวันนัดตรงกับวันนี้ เจ้าหน้าที่จึงยืนยันก่อนหรือหลังวันนัดได้

เมื่อนักศึกษาโหลดรายการจองใหม่ จะเห็นสถานะและเวลารับ โดยไม่แสดง QR สำหรับรายการ RECEIVED จำนวนผู้จองรอบเดิมไม่ลดลงเมื่อรับหนังสือ

## กล้องและไฟล์ภาพ

กล้องต้องได้รับอนุญาตจากผู้ใช้และใช้ secure context เช่น localhost กล้องจะหยุดเมื่ออ่าน QR ได้ ออกจากหน้า หรือซ่อนแท็บ ระบบไม่ขอไมโครโฟน หากเปิดกล้องไม่ได้ให้เลือกไฟล์ภาพแทน

รองรับ PNG, JPEG และ WebP ไม่เกิน 10 MB ภาพถูกย่อด้านยาวไม่เกิน 1600 พิกเซลเพื่ออ่านด้วย jsQR ภายใน browser ส่งเฉพาะ token ไปยัง API ไม่อัปโหลดภาพ QR ที่เล็กหรือเบลอควรถ่ายใหม่หรือใช้ PNG ต้นฉบับ

เว็บนี้ยังตั้งค่าสำหรับ localhost ไม่ได้เปิดให้โทรศัพท์เข้าเครื่องผ่าน LAN เจ้าหน้าที่ใช้กล้องคอมพิวเตอร์อ่าน QR ที่แสดงบนโทรศัพท์ได้ การนำไปใช้ HTTPS ต้องตั้งค่าการให้บริการและ origin ของ backend เพิ่ม ไม่ใช่เพียงเปลี่ยน URL

อ้างอิง: [jsQR](https://github.com/cozmo/jsQR) และ [ข้อกำหนด getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

## ทดสอบด้วย PowerShell

```powershell
npm test
```

ผลล่าสุด: 44 tests ผ่าน 38 ข้าม 6 กลุ่ม MySQL เพราะยังไม่ได้เปิดตัวเลือก

```powershell
$env:RUN_MYSQL_TESTS='1'
try {
    npm test
} finally {
    Remove-Item Env:RUN_MYSQL_TESTS
}
```

ผลล่าสุด: 94 tests ผ่านทั้งหมด ไม่มี failed หรือ skipped ใช้ MySQL จริง โดยบัญชีฐานข้อมูลที่ใช้ทดสอบต้องสร้างและลบฐานทดสอบได้ ชุด integration สร้างฐานแยกและลบเมื่อจบ ไม่ยืนยันรับรายการจริงของผู้ใช้

ครอบคลุมสิทธิ์เจ้าหน้าที่, QR ผิดรูปแบบ/ไม่พบ/ไม่ตรงรายการ, lookup ไม่เปลี่ยนสถานะ, ยืนยันและเวลารับ, รับซ้ำ, ยืนยันพร้อมกันได้ผู้ชนะเพียงหนึ่งคำขอ, สถานะที่ไม่อนุญาต, rollback เมื่ออ่านใบรับล้มเหลว, migration รักษาข้อมูล และการกู้ผลเมื่อการตอบกลับขาดหาย

ตรวจ browser จริงด้วยภาพ PNG ในฐานทดสอบแยกแล้ว: Login → อ่าน QR → แสดงรายละเอียด → ยืนยัน → อ่านซ้ำและป้องกันรับซ้ำ รวมหน้าจอมือถือ 390 พิกเซล ไม่มีแนวนอนล้น กล้องทดสอบการเปิด/ยกเลิก/หยุด stream ด้วยการจำลองแล้ว แต่ยังไม่ได้ทดสอบกล้องจริงทางกายภาพ

## ไฟล์เพิ่มและแก้ไข

ไฟล์เพิ่ม:
- backend/pickup.js — ค้นหาและยืนยันแบบ transaction พร้อม row lock
- backend/pickup-api.js — API สำหรับเจ้าหน้าที่
- backend/scripts/migrate-phase8.js — เพิ่ม received_at โดยรักษาข้อมูลเดิม
- backend/tests/phase8.mysql.test.js — MySQL และ HTTP integration
- backend/tests/scanner.test.js — พฤติกรรมหน้า scanner
- frontend/admin-scanner.html — หน้าสแกนเจ้าหน้าที่
- frontend/assets/scanner-ui.js — กล้อง ภาพ QR รายละเอียด และยืนยัน
- PHASE-8.md และ API-PHASE-8.md — คู่มือและ API

ไฟล์แก้:
- backend/server.js — เชื่อม API ป้องกันหน้า scanner ให้บริการ jsQR และตรวจ migration ตอนเริ่ม
- backend/bookings.js — เพิ่ม received_at ในข้อมูลใบจอง
- backend/tests/frontend.test.js — โหลดส่วน scanner ในชุดทดสอบหน้าเว็บ
- frontend/assets/app.js, booking-ui.js และ styles.css — เมนู scanner ใบรับและรูปแบบหน้า
- HTML เดิมทุกหน้าใน frontend/ — โหลด scanner-ui.js ก่อน app.js
- database/schema.sql, DATA-DICTIONARY.md และ ER-DIAGRAM.md — คอลัมน์เวลารับและคำอธิบาย
- package.json และ package-lock.json — เวอร์ชัน 8.0.0, jsqr 1.4.0 เป็น runtime dependency และคำสั่ง migrate
- README.md — สถานะล่าสุดและลิงก์คู่มือ

อ่านรูปแบบคำขอและคำตอบใน [API-PHASE-8.md](API-PHASE-8.md) ไฟล์ ZIP ส่งมอบไม่รวม `.env` และ `node_modules` ให้ใช้ `.env` เดิมและรัน `npm ci`
