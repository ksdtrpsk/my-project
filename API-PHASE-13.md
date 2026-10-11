# API Phase 13 — Reports

ทุก endpoint ใช้ admin session cookie จากระบบเดิม ตรวจบัญชี admin ทุกคำขอ เป็น GET และไม่รับ body ไม่เปลี่ยนข้อมูล

## GET /api/admin/reports/bookings

อ่านรายงานแบบแบ่งหน้า

| Query | ความหมาย |
|---|---|
| report | all (ค่าเริ่มต้น), received, pending หรือ no_show |
| q | คำค้นรหัสนักศึกษา ชื่อเต็ม หรือเลขคิว ไม่เกิน 100 ตัวอักษรตาม Phase 12 |
| department_id | unsigned INT บวก |
| education_level_id | unsigned INT บวก |
| classroom_id | unsigned INT บวก |
| date | วันนัดรับ YYYY-MM-DD ค.ศ. |
| status | WAITING, CHECKED_IN, RECEIVED, CANCELLED, NO_SHOW ใช้ AND กับประเภท |
| page | จำนวนเต็ม 1–1000000 ค่าเริ่มต้น 1 |

ไม่รับ group_by/group_id ของ Dashboard ให้ใช้ตัวกรองกลุ่มโดยตรง ไม่รับ key ซ้ำหรือ query อื่น

all รวมทุกสถานะ received เฉพาะ RECEIVED pending รวม WAITING/CHECKED_IN no_show เฉพาะ NO_SHOW ไม่อนุมานสถานะจากวันย้อนหลัง

ตัวอย่าง: `/api/admin/reports/bookings?report=pending&department_id=10&page=1`

HTTP 200 ตัวอย่างข้อมูลสมมติ:

```json
{
  "report": "pending",
  "generated_at": "2030-01-01 09:00:00",
  "total": 1,
  "page": 1,
  "page_size": 25,
  "bookings": [
    {
      "booking_id": 104,
      "book_set_id": 4,
      "student_code": "900010",
      "first_name": "นักศึกษาทดสอบ",
      "last_name": "10",
      "department_name": "ไอทีทดสอบ",
      "education_level_name": "ปวส.1",
      "classroom_name": "1/1",
      "semester": 1,
      "academic_year": 2574,
      "queue_number": "A001",
      "booking_status": "WAITING",
      "booking_date": "2031-09-15",
      "start_time": "09:00:00",
      "end_time": "09:30:00",
      "created_at": "2030-01-01 09:00:00",
      "received_at": null
    }
  ]
}
```

เรียงสาขา ระดับ ห้อง วันนัด เวลาเริ่ม booking_id แบบ ASC จำนวน total เป็นจำนวนที่ตรงเงื่อนไขก่อนแบ่งหน้า ไม่ใช่คนไม่ซ้ำ

## GET /api/admin/reports/bookings.csv

ดาวน์โหลดทุกรายการที่ตรงเงื่อนไข รับ query เหมือน JSON ยกเว้นไม่รับ page หากส่ง page จะได้ 400 เพื่อไม่ให้เข้าใจผิดว่า export เฉพาะหน้า

ตัวอย่าง: `/api/admin/reports/bookings.csv?report=received&department_id=10&date=2030-01-01`

HTTP 200:

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="bookings-received-2030-01-01.csv"
Cache-Control: no-store, private
```

Body เป็น CSV UTF-8 BOM พร้อมหัวภาษาไทย ไม่ใช่ JSON คอลัมน์ตาม PHASE-13.md ทุก field ครอบ double quote, quote ภายในซ้ำสองตัว, records ใช้ CRLF ข้อความที่อาจเป็นสูตรเติม apostrophe เพื่อให้เป็นข้อความ

ส่งออกสูงสุด 10,000 รายการ เกินได้ 413 JSON พร้อมคำแนะนำให้กรองเพิ่ม ไม่มี partial CSV รายงานว่างส่ง CSV header อย่างเดียว ข้อมูล CSV อ่านใหม่ตอนส่งออก จึงอาจต่างจากหน้า preview ถ้ามีการเปลี่ยน booking ระหว่างคำขอ

## ข้อผิดพลาด

| HTTP | ความหมาย |
|---|---|
| 400 | report/query/ID/date/status/page ไม่ถูกต้องหรือ key ซ้ำ |
| 401 | ไม่มี admin session หมดอายุ หรือบัญชีถูกลบ |
| 403 | ใช้ student session |
| 404 | ไม่พบ endpoint |
| 405 | Method ไม่ใช่ GET (Allow: GET) |
| 413 | CSV เกิน 10,000 รายการ ให้กรองเพิ่ม |
| 503 | ฐานข้อมูลไม่พร้อม |

ข้อผิดพลาดทั้งสอง endpoint เป็น JSON `{ "message": "ข้อความอธิบาย" }` ไม่เปิดเผย SQL, รหัสผ่าน หรือ QR token และไม่ส่ง CSV attachment header เมื่อผิดพลาด
