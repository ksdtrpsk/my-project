# API Phase 5 — Booking Slots

Base URL `http://localhost:3000` ใช้ Cookie Login เดิมตาม [API Phase 4](API-PHASE-4.md) ทุก API ของรอบต้อง Login และตรวจว่าบัญชียังมีอยู่ นักศึกษาใช้ book_queue_session เจ้าหน้าที่ใช้ book_queue_admin_session

## Endpoint

| Method | Endpoint | Input | Output / หน้าที่ |
| --- | --- | --- | --- |
| GET | /api/admin/booking-slots | date ไม่บังคับ | 200 object slots แสดงทุกวันที่ หรือเฉพาะวันที่กรอง |
| POST | /api/admin/booking-slots | JSON ข้อมูลรอบครบ | 201 object slot เพิ่มรอบ |
| PUT | /api/admin/booking-slots/:id | JSON ข้อมูลรอบครบ | 200 object slot แทนที่ข้อมูลรอบ |
| DELETE | /api/admin/booking-slots/:id | JSON `{}` | 200 `{"message":"ลบรอบแล้ว"}` ลบรอบที่ไม่มีประวัติ |
| PATCH | /api/admin/booking-slots/:id/status | JSON `{"status":"OPEN"}` หรือ `{"status":"CLOSED"}` | 200 object slot เปิด/ปิดรอบ |
| GET | /api/student/booking-slots | date ไม่บังคับ | 200 object slots รอบตั้งแต่วันนี้ตามเวลาไทย |

date รูปแบบ YYYY-MM-DD ค.ศ. ตัวอย่าง `/api/student/booking-slots?date=2031-09-15` อนุญาตตัวกรอง date หนึ่งค่าเท่านั้น ไม่รับ student_id หรือข้อมูลกลุ่ม ไม่เปิด endpoint จองใน Phase นี้

## สร้างและแก้รอบ

POST/PUT ส่ง `Content-Type: application/json` พร้อม body:

```json
{
  "booking_date": "2031-09-15",
  "start_time": "09:00",
  "end_time": "09:30",
  "max_students": 20,
  "status": "OPEN"
}
```

เลือกวันที่/เวลาในอนาคตเมื่อใช้งานจริง API รับเวลา HH:mm หรือ HH:mm:ss ในวันเดียวกัน ปีเป็น ค.ศ. จำนวนต้องเป็นตัวเลขจำนวนเต็ม 1–65535 วันที่และเวลาตรวจจริง ไม่ยอมรับวันที่ไม่มีอยู่หรือเริ่มย้อนหลัง

ตัวอย่าง response เมื่อยังไม่มีการจอง:

```json
{
  "slot": {
    "slot_id": 1,
    "booking_date": "2031-09-15",
    "start_time": "09:00:00",
    "end_time": "09:30:00",
    "max_students": 20,
    "status": "OPEN",
    "booked_count": 0,
    "has_bookings": false,
    "remaining": 20,
    "availability": "AVAILABLE"
  }
}
```

GET คืน `{"slots":[]}` หากไม่มีรายการ หรือ slots เป็น array ของ object รูปแบบเดียวกับ slot ด้านบน เรียงวันที่ เวลาเริ่ม และ ID

## ฟิลด์ที่คำนวณ

| Field | ความหมาย |
| --- | --- |
| booked_count | จำนวน bookings ของรอบที่ booking_status ไม่ใช่ CANCELLED |
| remaining | max_students ลบ booked_count ขั้นต่ำศูนย์ |
| has_bookings | มีประวัติการจองอย่างน้อยหนึ่งรายการ รวม CANCELLED |
| availability | CLOSED ถ้าปิดรอบ, PAST ถ้าถึงเวลาเริ่มแล้ว, FULL ถ้าเหลือศูนย์, นอกนั้น AVAILABLE ตามลำดับนี้ |

ไม่คืนรายชื่อ รหัสนักศึกษา QR หรือข้อมูลส่วนบุคคลจาก bookings การเปิด/ปิดรอบไม่เปลี่ยน booked_count รอบที่มีประวัติห้ามเปลี่ยนวัน/เวลาและห้ามลบ ลดความจุต่ำกว่า booked_count ไม่ได้

## ข้อผิดพลาด

รูปแบบ `{"message":"คำอธิบาย"}`

| Status | กรณี |
| --- | --- |
| 400 | วัน/เวลา/ความจุ/status/ID/filter ไม่ถูกต้อง, JSON ผิด, เพิ่ม/แก้หรือเปิดรอบย้อนหลัง |
| 401 | ไม่มี Session หรือบัญชีไม่อยู่แล้ว |
| 403 | นักศึกษาเรียก API admin หรือคำขอแก้ไขมาจากเว็บไซต์อื่น |
| 404 | ไม่พบรอบหรือเส้นทาง |
| 405 | Method ไม่รองรับ พร้อม Allow header |
| 409 | รอบซ้ำ, มีประวัติห้ามแก้เวลา/ลบ, ความจุต่ำกว่าจำนวนจอง หรือ transaction ชนกัน |
| 413 | Body เกิน 4,096 bytes |
| 415 | ไม่ส่ง application/json ในคำขอที่ต้องมี body |
| 503 | ฐานข้อมูลไม่พร้อมใช้งาน |

GET ไม่รับ body POST/PUT/PATCH/DELETE ตรวจ origin และสิทธิ์ฝั่ง server ทุกครั้ง ค่าที่ส่ง SQL ใช้ prepared parameters การแก้ไขล็อกแถวใน transaction รองรับกรณีเจ้าหน้าที่ทำรายการพร้อมกัน
