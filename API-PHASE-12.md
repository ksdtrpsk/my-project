# API Phase 12 — Search และ Filter

## GET /api/admin/bookings

เพิ่ม query parameter จาก API Phase 11 ไม่เปลี่ยนรูปแบบคำตอบ ต้องมี admin session cookie ไม่รับ body และไม่เปลี่ยนข้อมูล

| Parameter | รูปแบบ / ความหมาย |
|---|---|
| q | คำค้นไม่เกิน 100 ตัวอักษรหลัง trim; จับบางส่วนรหัสนักศึกษา ชื่อเต็ม หรือเลขคิว |
| department_id | unsigned INT บวก; สาขาของ Book Set |
| education_level_id | unsigned INT บวก; ระดับชั้นของ Book Set |
| classroom_id | unsigned INT บวก; ห้องของ Book Set |
| date | YYYY-MM-DD ค.ศ. วันที่นัดรับจริงตามปฏิทิน |
| status | WAITING, CHECKED_IN, RECEIVED, CANCELLED หรือ NO_SHOW แบบตัวพิมพ์ใหญ่ |
| group_by | department, level, classroom, date, book_set ตาม Phase 11 |
| group_id | ID หรือวันที่ตาม group_by ต้องระบุ group_by คู่กัน |
| page | จำนวนเต็ม 1–1000000 ค่าเริ่มต้น 1 |

ทุกเงื่อนไขเชื่อม AND คำค้นภายใน q เชื่อม OR ระหว่างรหัส ชื่อเต็ม และเลขคิว ตัวกรองที่ไม่ใช้ให้ไม่ส่ง parameter; q ว่าง/ช่องว่างล้วนถือว่าไม่ค้น แต่ ID/date/status ว่างผิดรูปแบบ

ตัวอย่าง:

```text
/api/admin/bookings?q=A001&department_id=10&education_level_id=10&classroom_id=10&date=2030-01-01&status=WAITING&page=1
```

ใช้ URLSearchParams เพื่อ encode คำค้นภาษาไทยและอักขระพิเศษ ไม่ต่อข้อความผู้ใช้เข้า SQL โดยตรง %, _ และ ! ถูก escape ให้ค้นตัวอักษรจริง รหัส ASCII ถูกแปลงเป็น utf8mb4 เฉพาะตอนค้นเพื่อรองรับคำค้นภาษาไทยใน OR เดียวกัน ไม่แก้ชนิดคอลัมน์

HTTP 200 ตัวอย่างข้อมูลสมมติ:

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

total คือจำนวนที่ตรงเงื่อนไขก่อนแบ่งหน้า เรียงวันนัด DESC เวลาเริ่ม DESC และ booking_id DESC ตามเดิม ค้นไม่พบให้ HTTP 200, bookings ว่างและ total=0 กลุ่มที่ขัดกัน เช่นสาขาหนึ่งกับห้องอีกสาขาให้ผลว่าง ไม่ละทิ้งตัวกรองเงียบ ๆ

## API เดิมที่ใช้ร่วมกัน

- GET /api/admin/lookups — ให้ departments, education_levels, classrooms สำหรับ dropdown ใช้สิทธิ์ admin เดิม
- GET /api/admin/dashboard?group_by=department — ยอดภาพรวม ไม่รับตัวกรองรายชื่อใหม่ของ Phase 12
- GET /api/admin/bookings/:booking_id — รายละเอียดเดิม ไม่รับ query parameter

## ข้อผิดพลาด

| HTTP | ความหมาย |
|---|---|
| 400 | ตัวกรองไม่ถูกต้อง, คำค้นยาวเกินกำหนด/มีอักขระควบคุม, parameter ไม่อนุญาตหรือซ้ำ |
| 401 | ไม่มี admin session, session หมดอายุ หรือบัญชีถูกลบ |
| 403 | ใช้ student session |
| 404 | ไม่พบ endpoint หรือรายละเอียด booking |
| 405 | Method ไม่ใช่ GET |
| 503 | ฐานข้อมูลไม่พร้อม ไม่เปิดเผย SQL/ข้อมูลเชื่อมต่อ |

ข้อผิดพลาดเป็น JSON `{ "message": "ข้อความอธิบาย" }` ตามเดิม ไม่มี endpoint สำหรับ export หรือแก้สถานะเพิ่มใน Phase 12
