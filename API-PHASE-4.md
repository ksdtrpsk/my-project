# API Phase 4

Base URL: `http://localhost:3000` ส่ง JSON ด้วย `Content-Type: application/json` และ Cookie ที่ได้จาก Login สำหรับคำขอถัดไป POST/PUT/DELETE จากเว็บไซต์อื่นถูกปฏิเสธ รายการทั้งหมดเป็นข้อมูล MySQL จริง

## Authentication

| Method | Path | การทำงาน |
| --- | --- | --- |
| POST | /api/admin/auth/login | รับ username/password คืน `{ "admin": { "admin_id": 1, "username": "admin", "name": "เจ้าหน้าที่ดูแลหนังสือ" } }` และ Cookie |
| GET | /api/admin/auth/me | คืน admin ของ Session ปัจจุบัน |
| POST | /api/admin/auth/logout | ยกเลิก Session เจ้าหน้าที่ |

Login body ตัวอย่าง (ให้แทนรหัสด้วยค่าของตนเอง):

```json
{"username":"admin","password":"your-own-admin-password"}
```

ใช้ Cookie `book_queue_admin_session` แยกจาก `book_queue_session` ของนักศึกษา ไม่คืน password/hash ใน response API นักศึกษา `/api/auth/*` เดิมยังใช้ตาม [Phase 3](API-PHASE-3.md) Login ผิดคืน 401, รูปแบบไม่ถูกต้อง 400, เกินขีดจำกัดการลอง Login 429

## หนังสือ (เฉพาะ admin)

| Method | Path | ผลสำเร็จ |
| --- | --- | --- |
| GET | /api/admin/books?q=คำค้น | 200 `{ "books": [] }` ค้นรหัส/ชื่อ ไม่ส่ง q คือทั้งหมด |
| POST | /api/admin/books | 201 `{ "book": ... }` |
| PUT | /api/admin/books/:id | 200 `{ "book": ... }` |
| DELETE | /api/admin/books/:id | 200 `{ "message": "ลบข้อมูลแล้ว" }` |

POST/PUT body:

```json
{"book_code":"IT001","book_name":"การเขียนโปรแกรม","description":"หนังสือประกอบการเรียน"}
```

รหัสไม่เกิน 30 ตัว ชื่อไม่เกิน 200 ตัว รายละเอียดไม่บังคับและไม่เกิน 5,000 ตัว q ไม่เกิน 100 ตัว การค้นหาใช้ parameter binding และค้น `%`/`_` เป็นตัวอักษรจริง DELETE ส่ง body `{}` หนังสือที่มีรายการในชุดลบไม่ได้

## Book Set (เฉพาะ admin)

| Method | Path | ผลสำเร็จ |
| --- | --- | --- |
| GET | /api/admin/lookups | 200 object มี departments, education_levels, classrooms |
| GET | /api/admin/book-sets | 200 `{ "book_sets": [] }` |
| POST | /api/admin/book-sets | 201 `{ "book_set": ... }` |
| PUT | /api/admin/book-sets/:id | 200 `{ "book_set": ... }` |
| DELETE | /api/admin/book-sets/:id | 200 `{ "message": "ลบข้อมูลแล้ว" }` |

POST/PUT body ตัวอย่าง ID สมมติ ต้องใช้ ID ที่มีในฐานจริง:

```json
{"department_id":1,"education_level_id":1,"classroom_id":1,"semester":1,"academic_year":2569,"book_ids":[1,2]}
```

PUT ส่งค่าครบเพื่อแทนที่ข้อมูลชุดและรายการหนังสือใน transaction เดียว semester เป็นตัวเลข 1–3, academic_year เป็นตัวเลข 2500–2999, book_ids มี 1–200 ID ไม่ซ้ำ ห้องต้องตรงสาขาและระดับที่เลือก DELETE ส่ง `{}` ชุดที่มีประวัติจองไม่สามารถแก้หรือลบได้

GET คืนข้อมูลกลุ่ม/ภาคเรียน/ปี พร้อมชื่อกลุ่ม หนังสือใน `books` และ `has_bookings` เพื่อใช้แสดงและจำกัดปุ่มบนหน้าเว็บ การตรวจสิทธิ์และประวัติยังทำซ้ำฝั่ง server เสมอ

## ชุดหนังสือของนักศึกษา

`GET /api/student/book-sets` ใช้ Cookie นักศึกษา คืน 200 `{ "book_sets": [] }` หากยังไม่มีชุดตรงกลุ่ม ถ้ามีจะคืนชุดพร้อมรายละเอียดและรายการหนังสือทุกภาคเรียน/ปีที่ตรงสาขา ระดับ และห้องของบัญชี

ไม่รับ query parameter ใด ๆ การส่ง student_id, department_id หรือค่าอื่นใน query คืน 400 ไม่ใช้ข้อมูลจาก client เพื่อเปลี่ยนกลุ่ม

## ข้อผิดพลาดร่วม

Response เป็น `{ "message": "คำอธิบาย" }`

| Status | ความหมาย |
| --- | --- |
| 400 | ค่าผิดรูปแบบ, JSON ไม่ถูกต้อง, กลุ่ม/หนังสือที่เลือกไม่ถูกต้อง |
| 401 | ยังไม่ Login หรือ Session หมดอายุ |
| 403 | นักศึกษาเรียก API admin หรือคำขอแก้ไขข้ามเว็บไซต์ |
| 404 | ไม่มีรายการหรือเส้นทาง API |
| 405 | Method ไม่รองรับสำหรับ resource นั้น |
| 409 | ข้อมูลซ้ำ, มีการอ้างอิง, มีประวัติจอง หรือชนกับการแก้ไขพร้อมกัน |
| 413 | Body ใหญ่เกินกำหนด |
| 415 | Content-Type ไม่ใช่ application/json |
| 503 | ฐานข้อมูลไม่พร้อมใช้งาน |

POST/PUT catalog รับ body ไม่เกิน 32,768 bytes; auth และ DELETE ใช้เพดาน 4,096 bytes ไม่เปิด API สร้างรอบหรือจองคิวใน Phase นี้
