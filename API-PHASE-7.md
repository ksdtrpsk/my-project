# API Phase 7 — Booking QR PNG

## GET /api/student/bookings/:id/qr

หน้าที่: ส่งภาพ QR ของการจองที่เป็นของนักศึกษาใน Session สำหรับแสดงหรือบันทึก PNG

Input:

- Path id เป็น booking_id จำนวนเต็มบวก 1–4294967295
- Cookie book_queue_session จาก Login นักศึกษาเดิม
- ไม่มี body และไม่รับ query parameter

ตัวอย่าง URL สำหรับ ID สมมติ 1:

```text
http://localhost:3000/api/student/bookings/1/qr
```

ผลสำเร็จ HTTP 200 เป็น binary PNG ไม่ใช่ JSON:

```text
Content-Type: image/png
Content-Length: จำนวนไบต์ของภาพ
Cache-Control: no-store, private
Cross-Origin-Resource-Policy: same-origin
```

ใช้ qrcode สร้างภาพขาวดำ error correction M, quiet zone 4 modules และ scale 8 ภาพเก็บ payload `BQ1:` ตามด้วย hexadecimal ตัวพิมพ์ใหญ่ 64 ตัว ซึ่งตรงกับ bookings.qr_code ไม่มีข้อมูลส่วนบุคคลหรือ URL ใน payload ขนาดภาพจริงขึ้นกับจำนวน modules และ frontend ย่อให้พอดีกับหน้าจอ

ตรวจว่า booking_id เป็นของ student_id จาก Session เท่านั้น หากไม่พบหรือเป็นของคนอื่นให้ 404 เหมือนกัน Cookie admin อย่างเดียวเปิดไม่ได้ อนุญาตเฉพาะ WAITING/CHECKED_IN และไม่เปลี่ยน booking_status

สำหรับรายการเดิมที่ qr_code เป็น NULL GET ครั้งแรกจะสร้าง token และ UPDATE เฉพาะแถวของเจ้าของที่ยังเป็น NULL จากนั้นอ่าน token ที่บันทึกแล้วมาสร้างภาพ การเปิดพร้อมกันหลายคำขอไม่เปลี่ยน token ที่สร้างไว้แล้ว เป็นการเติมข้อมูลประกอบการแสดงผลเดิม ไม่สร้างการจองใหม่

## ผลต่อ API Phase 6

POST /api/student/bookings ยังคงรับ `{"book_set_id":1,"slot_id":1}` และคืน receipt รูปแบบเดิม แต่เพิ่ม token ภายใน transaction ที่บันทึกการจอง GET /api/student/bookings คืนรายการรูปแบบเดิม ไม่เพิ่ม qr_code/token ใน JSON หน้าเว็บสร้าง URL ภาพจาก booking_id ที่ได้รับมา

ถ้าการจอง rollback token ที่สร้างใน transaction นั้นจะไม่ค้างในฐานข้อมูล คอลัมน์และ unique key ใช้ของ Phase 2 เดิม ไม่มี migration

## ข้อผิดพลาด

ผลที่ไม่สำเร็จใช้ JSON `{"message":"คำอธิบาย"}` ตาม API เดิม:

| Status | กรณี |
| --- | --- |
| 400 | ID ไม่ถูกต้องหรือมี query parameter |
| 401 | ไม่มี Session นักศึกษา, หมดอายุ, Logout แล้ว หรือบัญชีไม่มีอยู่ |
| 404 | ไม่พบการจองของบัญชีนี้หรือเส้นทางไม่ถูกต้อง |
| 405 | Method ไม่ใช่ GET พร้อม Allow: GET |
| 409 | สถานะไม่รองรับการแสดง QR หรือ token เก่าไม่ตรงรูปแบบ BQ1 |
| 503 | ฐานข้อมูลหรือระบบสร้างภาพไม่พร้อม โดยไม่เปิดเผยข้อมูลเชื่อมต่อ |

การได้รับภาพหรือสแกนอ่านข้อความ token ไม่ใช่การยืนยันรับหนังสือ Phase นี้ยังไม่มี API สแกน ค้นหาจาก token หรือเปลี่ยนสถานะเป็น RECEIVED ฟังก์ชันดังกล่าวเป็น Phase 8
