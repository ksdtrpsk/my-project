# Feature 2 — Password API

Base URL http://localhost:3000 ต้อง Login ตามบทบาทและบัญชียังอยู่ในฐานข้อมูล ทุกเส้นทางรับเฉพาะ POST application/json ไม่รับ query parameter และไม่เปิด CORS ตรวจ Origin/Sec-Fetch-Site ก่อนเขียน

| Method | Endpoint | Input | ผลลัพธ์/หน้าที่ |
|---|---|---|---|
| POST | /api/auth/password | current_password, new_password, confirm_password | เปลี่ยนรหัสนักศึกษาจาก Student session เท่านั้น |
| POST | /api/admin/auth/password | current_password, new_password, confirm_password | เปลี่ยนรหัส Admin จาก Admin session เท่านั้น |
| POST | /api/admin/students/:id/password | current_password, new_password, confirm_password, student_code | Admin รีเซ็ตรหัสนักศึกษา โดยตรวจรหัสปัจจุบันของ Admin และรหัสนักศึกษาที่เลือก |

ผลสำเร็จทุก endpoint: 200 {"message":"ข้อความยืนยัน"} ไม่คืน password/hash/token การเปลี่ยนรหัสตัวเองส่ง cookie หมดอายุและเพิกถอนทุก session ของบัญชี การ reset เพิกถอน Student sessions ของ id เป้าหมายโดยคง Admin session ไว้

## Input

```json
{
  "current_password": "current-password",
  "new_password": "new-password-example",
  "confirm_password": "new-password-example"
}
```

ตัวอย่างเป็นรูปแบบเท่านั้น ไม่ใช่รหัสเริ่มต้นของระบบ สำหรับ reset เพิ่ม student_code เป็น string ตรงกับบัญชี เช่น "00990001"; id ใช้จำนวนเต็มบวก 1–4294967295 current_password คือรหัสของ Admin ที่ Login อยู่ ไม่ใช่รหัสเดิมของนักศึกษา

current_password ยาว 1–128 หน่วย UTF-16 new_password นักศึกษา 12–128 ส่วน Admin เปลี่ยนรหัสของตนเอง 6–128 ต้องยืนยันตรงทุกตัวอักษร ไม่รับแต่ whitespace และต้องต่างจากรหัสเดิม password ไม่ trim เพื่อคงค่าที่ผู้ใช้ตั้ง Body จำกัด 8192 bytes ไม่รับ field เพิ่ม เช่น student_id, admin_id หรือ role

บัญชีผู้เปลี่ยนมาจาก session เท่านั้น ไม่ใช้ id ที่ส่งมาเพื่อเปลี่ยนรหัสตัวเอง ส่วน reset ใช้ id เป้าหมายจาก path และตรวจ student_code ซ้ำป้องกันเลือกบัญชีจากหน้าที่ข้อมูลเก่า

## Transaction และ Session

เปลี่ยนรหัสเองล็อกแถวบัญชีด้วย FOR UPDATE ตรวจ hash เดิม สร้าง hash ใหม่ ตรวจ session ยังใช้ได้ แล้ว UPDATE และ commit การ reset ล็อก Admin ก่อน Student เพื่อให้รหัสเจ้าหน้าที่ที่ตรวจไม่เปลี่ยนระหว่างดำเนินการ ถ้าข้อผิดพลาดจะ rollback

เมื่อ commit แล้วเพิกถอนทุก token ของบัญชีที่เปลี่ยนรหัส ไม่มี session ใหม่อัตโนมัติ Login เดิมที่กำลังตรวจรหัสอยู่จะตรวจ revision ก่อนออก token หากมีการเพิกถอนเกิดขึ้นระหว่างนั้นคืน 409 ให้ลอง Login ใหม่ เป็นกลไกสำหรับ Node process เดียว

ข้อจำกัดคำขอเปลี่ยนรหัส: 5 ครั้งต่อ role/account ใน 15 นาที ใช้ bucket ร่วมระหว่าง Admin self-change และ reset นักศึกษา จองจำนวนก่อน await เพื่อไม่ให้คำขอพร้อมกันหลุดขีดจำกัด เมื่อสำเร็จล้าง bucket เมื่อครบคืน 429 พร้อม Retry-After วินาทีที่เหลือ ไม่ปะปนกับ rate limit ของหน้า Login เดิม

## Errors

| Status | ความหมาย |
|---|---|
| 400 | JSON/field/query/รหัสปัจจุบันผิด ยืนยันไม่ตรง รหัสใหม่ผิดขนาดหรือเหมือนเดิม |
| 401 | ไม่มี session ของบทบาทนั้น session ถูกยกเลิก/หมดอายุ หรือบัญชีถูกลบ |
| 403 | Student พยายามใช้ API Admin หรือคำขอเขียนข้าม origin |
| 404 | ไม่พบนักศึกษาเป้าหมายหรือเส้นทาง |
| 405 | Method ไม่ใช่ POST |
| 409 | รหัสนักศึกษาไม่ตรงกับหน้าที่เปิดไว้ การทำงานชนกัน หรือ Login แข่งกับการเพิกถอน |
| 413 / 415 | Body เกินขนาด / Content-Type ไม่ใช่ JSON |
| 429 | เกินจำนวนตรวจรหัสที่อนุญาต |
| 503 | ฐานข้อมูล/ข้อผิดพลาดภายในโดยไม่เปิดเผย SQL หรือรหัสลับ |

Error ใช้ {message} รหัสปัจจุบันผิดใช้ 400 เพื่อให้ฟอร์มแสดงข้อผิดพลาดและยังรักษา session เดิมไว้ ส่วน session invalid ใช้ 401 ให้กลับ Login ไม่มี endpoint ส่งรหัสเก่ากลับและไม่มี reset Admin คนอื่น
