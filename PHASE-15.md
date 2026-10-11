# Phase 15 — Validation และ Security

ตรวจระบบตามขอบเขต Phase 15 และปรับการตรวจข้อมูล สิทธิ์การเข้าถึง และการจัดการข้อผิดพลาด โดยคงการจอง QR Code การรับหนังสือ My Booking Dashboard รายงาน และประกาศตามเดิม Phase 10 ถูกตัดออก และยังไม่เริ่ม Phase 16

## วิธีรัน

เปิด PowerShell ในโฟลเดอร์โปรเจ็กต์ หยุด server เดิมด้วย Ctrl+C แล้วรัน:

```powershell
cd "C:\Users\KSD\Documents\Codex\2026-09-11\files-pasted-by-the-user-web\outputs\book-queue"
npm start
```

เปิด http://localhost:3000/ หรือ http://localhost:3000/admin-login.html ใช้บัญชีและรหัสผ่านเดิม ไม่มี migration และไม่มี dependency ใหม่ใน Phase 15 ไม่ต้อง seed/import ฐานข้อมูลซ้ำ หากติดตั้งจาก ZIP ในที่ใหม่ ให้รัน npm ci และเตรียม .env กับฐานข้อมูลตามคู่มือเดิมก่อน

## สิ่งที่ปรับ

- ตรวจ JSON object, UTF-8, ชนิด/ขนาดข้อมูล และไม่รับ field ส่วนเกินใน Login หนังสือ ชุดหนังสือ รอบรับหนังสือ และเปลี่ยนสถานะรอบ
- DELETE หนังสือ/ชุด/รอบ และ Logout รับเฉพาะ JSON ว่าง `{}`; ตัวกรอง Catalog ไม่รับชื่อที่ไม่รองรับหรือค่าซ้ำ การเขียนรอบไม่รับ query parameter
- จำกัดขนาด JSON ตั้งแต่ Content-Length หรือเมื่อข้อมูล chunked เกินขนาด ไม่รอให้ upload จบก่อนตอบ 413 และปิดการเชื่อมต่อคำขอที่ใหญ่เกินไป
- แก้การนับ login attempt เมื่อส่งพร้อมกัน ให้ใช้ bucket เดียวกัน จำกัด 10 ครั้งใน 15 นาทีต่อ IP แยก Student/Admin พร้อม Retry-After; login สำเร็จล้างตัวนับของ IP นั้น
- หน้า private ตรวจทั้ง session และบัญชีจากฐานข้อมูลทุกครั้ง รวม HEAD หากบัญชีถูกลบจะล้าง session และส่งกลับหน้าล็อกอิน หากฐานข้อมูลขัดข้องแสดงข้อผิดพลาดทั่วไป
- อนุญาตเฉพาะไฟล์หน้าเว็บ/asset ที่ระบุไว้ ปิดการเปิดผ่านชื่อไฟล์แบบ Windows เช่น trailing dot, ADS และไฟล์สำรองที่อาจถูกวางใน frontend
- ข้อผิดพลาดจาก dependency หรือฐานข้อมูลไม่เปิดเผยข้อความภายใน แม้มี property status; ข้อความที่แสดงได้ต้องสร้างผ่าน HttpError ของระบบ
- เพิ่ม Referrer-Policy, Cross-Origin-Resource-Policy, Permissions-Policy และ CSP form-action; อนุญาตกล้องจากเว็บไซต์เดียวกันสำหรับ Scanner เดิม
- จำกัดเวลา HTTP request 30 วินาที, headers 15 วินาที, keep-alive 5 วินาที

## สิ่งที่ตรวจแล้วจากระบบเดิม

| ข้อกำหนด | ผลตรวจ |
|---|---|
| ห้ามจองวันย้อนหลัง/รอบเริ่มแล้ว | ตรวจเวลาประเทศไทยบน server ก่อนบันทึก |
| ห้ามจองเต็ม | ล็อกรอบและตรวจจำนวนที่ใช้จริงใน transaction รวมการแย่งที่นั่งสุดท้าย |
| ห้ามจองซ้ำ | ล็อกบัญชีและตรวจชุดที่ยังไม่ยกเลิก รวมการส่งพร้อมกันต่างรอบ |
| ห้ามเข้า Admin โดยไม่ Login/ใช้ Student | ตรวจ cookie แยกบทบาททุกหน้าและ API ที่ต้องใช้สิทธิ์ |
| Validate input | ชนิดข้อมูล ช่วงตัวเลข วันที่ เวลา ความยาว และ field ที่อนุญาต |
| SQL Injection | ใช้ prepared parameters; ส่วน SQL ที่ประกอบเองใช้ชื่อ/ตัวเลือกที่กำหนดไว้และตัวเลขที่ผ่าน validation |
| Hash password | scrypt + salt สุ่ม และ timingSafeEqual; ไม่ส่ง hash ใน profile/API |
| API ต้อง Login | ตรวจครอบคลุม Auth, Catalog, Slots, Bookings, QR, Pickup, Dashboard, Reports, Announcements |
| Error handling | 4xx สำหรับคำขอไม่ถูกต้อง, ข้อผิดพลาดภายในไม่เปิดเผย SQL/รหัสผ่าน; transaction rollback |
| XSS และ CSV formula | ข้อความผ่าน escapeHtml, CSV ป้องกันสูตร และ QR ตรวจเจ้าของรายการ |

ดูหลักฐานและข้อจำกัดใน SECURITY-REVIEW.md และรายละเอียด API ที่ปรับใน API-PHASE-15.md

## วิธีทดสอบ

```powershell
$env:RUN_MYSQL_TESTS='1'
try { npm test } finally { Remove-Item Env:RUN_MYSQL_TESTS -ErrorAction SilentlyContinue }
```

ผล: **175 tests ผ่านทั้งหมด**, failed 0, skipped 0 รวม MySQL จริงในฐานทดสอบชื่อสุ่มแยกจากฐานใช้งานจริง พร้อมล้างหลังเสร็จ สิทธิ์ MySQL สำหรับการทดสอบต้องสร้าง/ลบฐานทดสอบได้ หากไม่ตั้ง RUN_MYSQL_TESTS จะข้าม integration tests

Browser ตรวจแล้ว: เปิด Admin โดยยังไม่ login ถูกส่งกลับหน้าเข้าสู่ระบบ → login Student แล้วเปิด Dashboard ยังถูกปฏิเสธ → login Admin สำเร็จ → เพิ่มหนังสือจากแบบฟอร์มเดิมสำเร็จและแสดง `<script>` เป็นข้อความ ทดสอบด้วยฐานและบัญชีทดสอบ ไม่มีการเปลี่ยนรหัสผ่านหรือเพิ่มหนังสือทดสอบในฐานใช้งานจริง

ทดสอบเองได้โดยออกจากบัญชี Admin ก่อน แล้วเปิด /dashboard.html โดยตรง ต้องถูกส่งไป /admin-login.html เมื่อล็อกอินเฉพาะ Student ก็ยังเปิดไม่ได้ หากเคยล็อกอิน Admin ใน browser เดียวกัน ต้องออกจาก Admin ก่อน เพราะ cookie ของสองบทบาทแยกกัน

## ไฟล์ส่งมอบ

เพิ่ม backend/errors.js, backend/validation.js, backend/tests/security.test.js, backend/tests/phase15.mysql.test.js และเอกสาร Phase 15

แก้ backend/auth.js, backend/catalog.js, backend/catalog-api.js, backend/slots.js, backend/slots-api.js, backend/server.js, frontend/assets/app.js (เลข Phase), package.json/package-lock.json (15.0.0), README.md และ PROJECT-SCOPE.md

โค้ดเต็ม: ../PHASE-15-FULL-CODE.md; ZIP: ../book-queue-phase-15.zip ไม่รวม .env, node_modules และ .git
