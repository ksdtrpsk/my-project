# Phase 14 API — Announcement

API เดิมทำงานร่วมกันตามเดิม ทุกผลตอบกลับเป็น JSON และ Cache-Control: no-store

| Method / URL | สิทธิ์ | ผลลัพธ์ |
|---|---|---|
| GET /api/admin/announcements | Admin | 200 {announcements: [...]} ล่าสุดไม่เกิน 50 รายการ |
| POST /api/admin/announcements | Admin | 201 {announcement: {...}} |
| GET /api/student/announcements/latest | Student | 200 {announcement: {...}} หรือ null เมื่อไม่มีประกาศ |

POST ต้องส่ง Content-Type: application/json โดย body ไม่เกิน 32,768 bytes:

```json
{
  "title": "กรุณานำบัตรนักศึกษามาด้วย",
  "content": "นำบัตรมาแสดงต่อเจ้าหน้าที่\nรับหนังสือที่ห้องสมุด",
  "request_id": "99e3c268-1839-4f9a-a3b7-e3260687529d"
}
```

สร้าง UUID v4 ใหม่สำหรับประกาศใหม่ ตัวอย่างข้างบนเป็นรูปแบบเท่านั้น หากลองหลายประกาศต้องเปลี่ยน request_id แต่การ retry คำขอเดิมให้ใช้ค่าเดิม

ตัดช่องว่างหัวท้าย; หัวข้อ 1–160 หน่วย UTF-16 ในบรรทัดเดียว เนื้อหา 1–5,000 หน่วย UTF-16 รองรับ newline/tab ไม่รับ control characters อื่นหรือ field นอกเหนือจากที่ระบุ ใช้ prepared parameters และตรวจสิทธิ์จาก session ไม่รับ created_by/created_at จาก client

Response announcement มี announcement_id, title, content, created_at (YYYY-MM-DD HH:mm:ss เวลาไทย) ไม่เปิดเผยรหัสผู้สร้างหรือ request_id เรียง created_at DESC, announcement_id DESC

request_id มี unique key: ถ้าผู้สร้างและข้อความตรงกับรายการที่บันทึกไว้ คืนรายการเดิมพร้อม 201; ถ้าใช้รหัสเดิมกับข้อความหรือผู้สร้างอื่นคืน 409 การส่งพร้อมกันไม่สร้างซ้ำ

| Status | ความหมาย |
|---|---|
| 400 | field, ข้อความ, UUID หรือ query parameter ไม่ถูกต้อง |
| 401 | ไม่มี session ที่ตรงบทบาท หรือบัญชีถูกลบ |
| 403 | นักศึกษาเข้าฝั่ง Admin หรือ POST มาจาก origin อื่น |
| 404 | path ไม่รองรับ |
| 405 | method ไม่รองรับ |
| 409 | request_id ถูกใช้กับข้อมูลอื่น |
| 413 | body ใหญ่เกินกำหนด |
| 415 | Content-Type ไม่ใช่ JSON |
| 503 | ข้อผิดพลาดฐานข้อมูล โดยไม่เปิดเผย SQL หรือรหัสผ่าน |

Admin ใช้ cookie book_queue_admin_session, นักศึกษาใช้ session เดิม แยกบทบาท; หน้า admin-announcements.html ต้องเข้าสู่ระบบเจ้าหน้าที่ก่อน การประกาศเป็นข้อมูลแจ้งนักศึกษาหลังเข้าสู่ระบบ ไม่ใช่หน้าจอเรียกคิวสาธารณะ
