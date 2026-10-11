# API Phase 9 — Student Cancellation

## POST /api/student/bookings/:booking_id/cancel

ยกเลิกการจองของนักศึกษาที่ Login อยู่ อ่าน student_id จาก session เท่านั้น ไม่รับรหัสนักศึกษาจาก client

ตัวอย่าง endpoint: `/api/student/bookings/104/cancel`

Header: `Content-Type: application/json` พร้อม student session cookie จาก Login เดิม

Body ต้องเป็น JSON object ว่าง:

```json
{}
```

booking_id เป็น unsigned INT บวก ห้ามส่ง query parameter ตรวจ same-origin และปฏิเสธ cross-site ตาม API เดิม

### ผลสำเร็จ

HTTP 200 เป็น `{ "booking": receipt }` โดย receipt มีทุก field เหมือน API ใบจอง Phase 6/8 และเพิ่ม `can_cancel` ตัวอย่างข้อมูลสมมติ:

```json
{
  "booking": {
    "booking_id": 104,
    "book_set_id": 1,
    "slot_id": 1,
    "queue_number": "A001",
    "booking_status": "CANCELLED",
    "created_at": "2030-01-01 09:00:00",
    "received_at": null,
    "student_code": "900010",
    "first_name": "นักศึกษาทดสอบ",
    "last_name": "10",
    "department_name": "ไอทีทดสอบ",
    "education_level_name": "ปวส.1",
    "classroom_name": "1/1",
    "semester": 1,
    "academic_year": 2574,
    "booking_date": "2031-09-15",
    "start_time": "09:00:00",
    "end_time": "09:30:00",
    "can_cancel": false,
    "books": [
      {"book_id": 1, "book_code": "WEB-01", "book_name": "การพัฒนาเว็บไซต์", "description": null}
    ]
  }
}
```

ตรวจใหม่ภายใน transaction: เจ้าของตรงกัน, WAITING, received_at ว่าง และเวลาปัจจุบันประเทศไทยน้อยกว่าเวลาเริ่มรอบ จากนั้นเปลี่ยนเป็น CANCELLED ไม่ลบแถว ไม่เปลี่ยนเลขคิว/token และไม่สร้างเวลารับ

### ข้อผิดพลาด

| HTTP | ความหมาย |
|---|---|
| 400 | ID/body ไม่ถูกต้อง, body มี field, มี query parameter |
| 401 | ไม่มี student session หรือบัญชีถูกลบ; admin session อย่างเดียวใช้ไม่ได้ |
| 403 | คำขอข้าม origin |
| 404 | ไม่มีรายการหรือไม่ใช่เจ้าของ (ข้อความเหมือนกัน) |
| 405 | Method ไม่ใช่ POST |
| 409 | ยกเลิกแล้ว, สถานะไม่อนุญาต, ถึงเวลาเริ่มรอบ หรือ transaction ขัดแย้ง |
| 413 | Body เกิน 4096 bytes |
| 415 | Content-Type ไม่ใช่ application/json |
| 503 | ฐานข้อมูลไม่พร้อม |

คำขอซ้ำได้ 409 และไม่คืนคิวเพิ่มอีก หากไม่ทราบผลจากเครือข่าย ให้ GET รายการล่าสุดก่อนทำรายการใหม่

## GET /api/student/bookings

Method และสิทธิ์เดิม ไม่รับ body/query parameter คืน HTTP 200 `{ "bookings": [receipt] }` ของเจ้าของ session ทั้งปัจจุบันและประวัติ เรียง booking_id ใหม่ก่อน ไม่มี token ในคำตอบ

แต่ละ receipt เพิ่ม `can_cancel` boolean คำนวณจากสถานะ เวลารับ และเวลาปัจจุบัน server ขณะอ่าน ใช้ช่วยแสดงปุ่มเท่านั้น คำขอ cancel ตรวจเงื่อนไขอีกครั้งเสมอ

POST จองเดิมยังทำงานตาม Phase 6 โดยรายการ CANCELLED ไม่ขวางการจอง Book Set เดิม API รอบเดิมนับเฉพาะรายการที่ไม่ยกเลิก จึงคืนคิวทันทีหลัง transaction commit ส่วน browser ที่เปิดค้างต้องโหลดจำนวนใหม่

GET QR ของรายการ CANCELLED ได้ 409 และ API ยืนยันรับของ Phase 8 ปฏิเสธ token เดิมด้วย 409 เช่นเดียวกัน
