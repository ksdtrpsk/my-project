# Phase 15 — API Validation Changes

ใช้ API URL และการล็อกอินเดิม ไม่มี endpoint ใหม่ รูปแบบคำขอที่หน้าเว็บเดิมส่งยังใช้งานได้

| คำขอ | ข้อมูลที่อนุญาต |
|---|---|
| POST /api/auth/login | student_code, password |
| POST /api/admin/auth/login | username, password |
| POST /api/auth/logout และ /api/admin/auth/logout | `{}` |
| POST /api/admin/books หรือ PUT /api/admin/books/:id | book_code, book_name, description (ไม่บังคับ) |
| POST /api/admin/book-sets หรือ PUT /api/admin/book-sets/:id | department_id, education_level_id, classroom_id, semester, academic_year, book_ids |
| POST /api/admin/booking-slots หรือ PUT /api/admin/booking-slots/:id | booking_date, start_time, end_time, max_students, status |
| PATCH /api/admin/booking-slots/:id/status | status เท่านั้น |
| DELETE หนังสือ/ชุด/รอบ | `{}` |
| GET /api/admin/books | query q ได้หนึ่งค่า |
| GET /api/admin/lookups และ /api/admin/book-sets | ไม่รับ query parameter |
| POST/PUT/PATCH/DELETE รอบรับหนังสือ | ไม่รับ query parameter |

ทุก API ที่อ่าน JSON รับ Content-Type application/json และ UTF-8 ที่ถูกต้อง body ต้องเป็น object ไม่ใช่ null, array หรือ primitive มีขนาดไม่เกิน 4,096 bytes ตามค่าเริ่มต้น; Catalog create/update และประกาศใช้ 32,768 bytes ตามเดิม ข้อจำกัดจำนวนตัวอักษรแต่ละ field ยังคงตรวจแยกจากจำนวน bytes

การปฏิเสธ field ส่วนเกินหรือค่าซ้ำคืน 400 โดยไม่เขียนข้อมูล JSON เสีย/UTF-8 เสียคืน 400; Content-Type ไม่ถูกต้องคืน 415; ขนาดเกินคืน 413 และ Connection: close การล็อกอินเกินจำนวนคืน 429 พร้อม Retry-After เป็นวินาที

สิทธิ์เดิม: ไม่มี session คืน 401; Student เรียก Admin API คืน 403 (Admin Auth คืน 401); ข้อมูลไม่พบคืน 404; ขัดกับสถานะข้อมูลคืน 409; ข้อผิดพลาดภายในคืน 503 โดยไม่เปิดเผยข้อความจาก driver

GET /api/auth/me ยังคงเลือกบัญชีจาก session เท่านั้น แม้ส่งรหัสบัญชีผ่าน query ก็ไม่เปลี่ยนผู้ใช้ ข้อจำกัด Booking, QR, Pickup, Dashboard, Reports และ Announcements ดูเอกสาร API ของ Phase นั้นร่วมด้วย

เมื่อเพิ่มหน้า/asset ใน Phase ถัดไป ต้องเพิ่มเส้นทางใน staticFiles ของ backend/server.js ด้วย หน้า Admin ใหม่ที่ชื่อ admin-*.html (ยกเว้น admin-login.html) ถูกตรวจบทบาทโดยอัตโนมัติ ส่วนหน้านักศึกษาใหม่ต้องเพิ่มใน protectedPages
