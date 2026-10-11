# API Phase 11 — Admin Dashboard

ทุก endpoint รับ GET และต้องมี admin session cookie จาก Login เดิม ไม่รับ body ไม่เปลี่ยนข้อมูล และตอบ JSON แบบ no-store นักศึกษาได้ 403 ผู้ไม่ Login ได้ 401 ตรวจว่าบัญชี admin ยังอยู่ทุกคำขอ

## GET /api/admin/dashboard

Input: query `group_by` เลือก department (ค่าเริ่มต้น), level, classroom, date หรือ book_set ไม่รับตัวเลือกอื่นหรือ key ซ้ำ

ตัวอย่าง: `/api/admin/dashboard?group_by=department`

Output HTTP 200 ตัวอย่างข้อมูลสมมติ:

```json
{
  "generated_at": "2030-01-01 09:00:00",
  "today": "2030-01-01",
  "group_by": "department",
  "totals": {"total": 1, "students": 1, "received": 0, "pending": 1, "cancelled": 0, "no_show": 0, "today": 1},
  "groups": [
    {"group_id": 10, "label": "ไอทีทดสอบ", "total": 1, "students": 1, "received": 0, "pending": 1, "cancelled": 0, "no_show": 0}
  ]
}
```

ยอด total นับรายการทุกสถานะและทุกวันนัด students นับนักศึกษาไม่ซ้ำ pending รวม WAITING/CHECKED_IN today นับตาม booking_slots.booking_date ตรงวันปัจจุบันประเทศไทย ทุก count ส่งเป็น JSON number ฐานว่างให้ 0 และ groups ว่าง กลุ่มที่ไม่มี booking ไม่แสดง

group_id เป็น ID ตามมิติที่เลือก ยกเว้น date เป็น string YYYY-MM-DD กลุ่มอิง book_sets ของรายการจอง ไม่ใช้กลุ่มใหม่ของบัญชีหากภายหลังเปลี่ยนข้อมูลนักศึกษา

## GET /api/admin/bookings

Input: `page` จำนวนเต็มบวก ค่าเริ่มต้น 1 สูงสุด 1000000 ถ้าดูเฉพาะกลุ่มให้ส่ง `group_by` กับ `group_id` คู่กัน group_by เหมือน summary; group_id ของ date ใช้วันที่ ค.ศ. ส่วนมิติอื่นเป็น unsigned INT บวก ไม่รับ q, status, ตัวกรองเพิ่มเติม หรือ key ซ้ำใน Phase นี้

ตัวอย่าง: `/api/admin/bookings?group_by=department&group_id=10&page=1`

Output HTTP 200:

```json
{
  "bookings": [
    {
      "booking_id": 104,
      "queue_number": "A001",
      "booking_status": "WAITING",
      "student_code": "900010",
      "first_name": "นักศึกษาทดสอบ",
      "last_name": "10",
      "department_name": "ไอทีทดสอบ",
      "education_level_name": "ปวส.1",
      "classroom_name": "1/1",
      "semester": 1,
      "academic_year": 2573,
      "booking_date": "2030-01-01",
      "start_time": "09:00:00",
      "end_time": "09:30:00"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 25
}
```

เรียงวันนัด DESC เวลาเริ่ม DESC และ booking_id DESC หน้าที่ไม่มีรายการให้ bookings ว่างพร้อมยอด total จริง ไม่ใช่ 404

## GET /api/admin/bookings/:booking_id

Input: booking_id unsigned INT บวกใน path ไม่รับ query parameter

Output HTTP 200 `{ "booking": receipt }` โดย receipt ใช้รายละเอียดเดียวกับ API ใบจอง Phase 9: booking_id, book_set_id, slot_id, queue_number, booking_status, created_at, received_at, student_code, first_name, last_name, department_name, education_level_name, classroom_name, semester, academic_year, booking_date, start_time, end_time, can_cancel และ books (book_id, book_code, book_name, description)

received_at เป็น null เมื่อยังไม่รับ can_cancel เป็นข้อมูลตามกฎนักศึกษาเดิม ไม่ได้ให้สิทธิ์ admin ยกเลิกผ่าน endpoint นี้ รายละเอียดไม่ส่ง qr_code, token หรือ password และไม่สร้างภาพ QR สำหรับ admin หน้าเว็บให้ลิงก์ไป scanner เดิม

## ข้อผิดพลาดร่วม

| HTTP | ความหมาย |
|---|---|
| 400 | ID, วันที่, group หรือ page ผิดรูปแบบ; query ไม่อนุญาตหรือซ้ำ |
| 401 | ไม่มี admin session, session หมดอายุ หรือบัญชี admin ถูกลบ |
| 403 | ใช้ student session แทน admin |
| 404 | ไม่พบ booking หรือ endpoint |
| 405 | Method ไม่ใช่ GET (Allow: GET) |
| 503 | ฐานข้อมูลไม่พร้อม โดยไม่เปิดเผย SQL หรือข้อมูลเชื่อมต่อ |

ข้อผิดพลาดเป็น `{ "message": "ข้อความอธิบาย" }` ตามรูปแบบเดิม API นี้ไม่ได้เพิ่มการแก้สถานะ ใช้ Admin QR Scanner ของ Phase 8 สำหรับยืนยันรับตามเดิม
