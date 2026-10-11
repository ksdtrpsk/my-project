# Phase 16 — Student Directory API

> บันทึกย้อนหลัง: Feature 1 เพิ่ม create/update/detail/groups/import แล้ว ดู API-FEATURE-1.md รูปแบบ GET list เดิมยังเหมือนเดิม ข้อความอ่านอย่างเดียวและ 405 สำหรับ POST ด้านล่างเป็นสถานะก่อน Feature 1

เพิ่ม API อ่านข้อมูลสำหรับเมนู Students ตามขอบเขต Sidebar Admin ของ Phase 16 ส่วนหน้ารายการจองใช้ API Phase 11–12 เดิม

## GET /api/admin/students

ต้องมี Admin session และบัญชียังอยู่ในฐานข้อมูล ไม่อนุญาต Student ไม่มี method สำหรับสร้าง/แก้ไข/ลบ

| Query | รายละเอียด |
|---|---|
| q | ไม่บังคับ ค้นรหัสนักศึกษาหรือชื่อ–นามสกุล ไม่เกิน 100 หน่วย UTF-16 ตัดช่องว่างต้นท้าย ไม่รับ control characters |
| page | จำนวนเต็ม 1–1,000,000 ค่าเริ่มต้น 1 |

ไม่รับชื่อ query อื่นหรือส่งค่าเดิมซ้ำ ใช้ prepared parameters; %, _ และ ! ถือเป็นข้อความค้นหาจริง ไม่ใช่ wildcard

```json
{
  "students": [
    {
      "student_id": 1,
      "student_code": "66309010001",
      "first_name": "ชื่อ",
      "last_name": "นามสกุล",
      "department_name": "สาขา",
      "education_level_name": "ปวส.2",
      "classroom_name": "2/1"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 25
}
```

ตัวอย่างเป็นเพียงรูปแบบผลตอบกลับ ข้อมูลจริงมาจากฐานข้อมูล เรียง student_code และ student_id; count และรายการอ่านใน transaction เดียวกัน ไม่ส่ง password/hash, phone หรือ email ไม่มีผลลัพธ์คืน students: [] และ total: 0

สถานะ: 200 สำเร็จ, 400 input ผิด, 401 ไม่มี Admin session/บัญชีถูกลบ, 403 ใช้ Student session, 405 method ไม่รองรับ, 503 ข้อผิดพลาดภายในโดยไม่เปิดเผย SQL

หน้า admin-students.html และ admin-bookings.html อยู่ใน static allowlist และตรวจสิทธิ์ Admin ตาม Phase 15 เช่นเดียวกับหน้าเจ้าหน้าที่เดิม
