# API Phase 8 — Admin Pickup

ต้อง Login เจ้าหน้าที่ผ่าน API เดิมก่อน ใช้ session cookie ของเจ้าหน้าที่ นักศึกษาเรียกไม่ได้ ทุก endpoint ต่อไปนี้รับ POST และ Content-Type: application/json ไม่รับ query parameter จำกัด body ตาม readJson ที่ 4096 bytes และปฏิเสธคำขอข้าม origin

## POST /api/admin/pickup/lookup

ตัวอย่าง token ด้านล่างเป็นค่าประกอบเอกสาร ไม่ใช่ QR ที่มีอยู่จริง:

```json
{"token":"BQ1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
```

รับเพียง token รูปแบบ `BQ1:` ตามด้วยเลขฐานสิบหกตัวพิมพ์ใหญ่ 64 ตัว ค้นหารายการและแสดงรายละเอียดโดยไม่เปลี่ยนสถานะหรือเวลารับ ห้ามส่ง token ผ่าน URL

## POST /api/admin/pickup/confirm

```json
{"token":"BQ1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","booking_id":1}
```

booking_id ต้องเป็นจำนวนเต็มบวกไม่เกิน unsigned INT และตรงกับ token ล็อกแถวด้วย FOR UPDATE ภายใน transaction แล้วตรวจสถานะก่อนเปลี่ยนเป็น RECEIVED และบันทึก received_at ในคำสั่งเดียว หากขั้นตอนอ่านผลล้มเหลวจะ rollback ทั้งคู่ ยืนยันพร้อมกันได้สำเร็จหนึ่งคำขอ ส่วนคำขอซ้ำได้ 409 โดยไม่เปลี่ยนเวลาเดิม

รับเฉพาะ WAITING/CHECKED_IN ที่ยังไม่มี received_at ไม่มีข้อบังคับวันนัดใน Phase นี้

## คำตอบสำเร็จของทั้งสอง endpoint

HTTP 200 ตัวอย่างหลังยืนยัน:

```json
{
  "booking": {
    "booking_id": 1,
    "book_set_id": 1,
    "slot_id": 1,
    "queue_number": "A001",
    "booking_status": "RECEIVED",
    "created_at": "2030-01-01 08:00:00",
    "received_at": "2030-01-01 09:00:00",
    "student_code": "IT900010",
    "first_name": "นักศึกษา",
    "last_name": "ทดสอบ",
    "department_name": "เทคโนโลยีสารสนเทศ",
    "education_level_name": "ปวส. 1",
    "classroom_name": "1",
    "semester": 1,
    "academic_year": 2573,
    "booking_date": "2030-01-01",
    "start_time": "09:00:00",
    "end_time": "10:00:00",
    "books": [
      {"book_id": 1, "book_code": "IT001", "book_name": "การเขียนโปรแกรม", "description": null}
    ]
  }
}
```

received_at เป็น null ก่อนรับ เวลาเป็นเวลาประเทศไทย รูปแบบ DATETIME ไม่มี suffix timezone ไม่มี token หรือรหัสผ่านในคำตอบ API ใบจองนักศึกษาของ Phase 6 เพิ่ม received_at เช่นเดียวกัน

## ข้อผิดพลาด

| HTTP | ความหมาย |
|---|---|
| 400 | JSON หรือ field ไม่ถูกต้อง, token ผิดรูปแบบ, มี query parameter |
| 401 | ไม่มี session เจ้าหน้าที่ หรือบัญชีเจ้าหน้าที่ถูกลบ |
| 403 | ใช้บัญชีนักศึกษา หรือคำขอจากเว็บไซต์อื่น |
| 404 | ไม่พบ token หรือ token ไม่ตรง booking_id |
| 405 | Method ไม่ใช่ POST |
| 409 | รับแล้ว, สถานะไม่อนุญาต หรือ transaction ขัดแย้ง |
| 413 | Body ใหญ่เกินกำหนด |
| 415 | Content-Type ไม่ใช่ JSON |
| 503 | ฐานข้อมูลไม่พร้อม |

ข้อผิดพลาดใช้รูปแบบ JSON เดิมของระบบ เมื่อรับแล้วข้อความคือ “รายการนี้รับหนังสือแล้ว” Client อ่านรายละเอียดใหม่ด้วย lookup เพื่อแสดงเวลารับเดิมได้ หน้า scanner ไม่ส่ง confirm ซ้ำอัตโนมัติเมื่อการตอบกลับขาดหาย แต่ค้นหาสถานะล่าสุดแทน
