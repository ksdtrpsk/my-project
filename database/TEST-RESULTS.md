# ผลตรวจ Phase 2

## อัปเดตเมื่อส่ง Phase 4

รัน schema.sql และ tests.sql เดิมผ่านบน MySQL 26.7.0 แล้ว โดยใช้ฐานชื่อสุ่มแยกจากฐานใช้งานจริงผ่าน backend/tests/phase4.mysql.test.js ทดสอบทั้งโปรเจ็กต์โดยเปิด RUN_MYSQL_TESTS=1 ผ่าน 34 tests ไม่มี failed/skipped อ่านขั้นตอนและขอบเขตใน [PHASE-4.md](../PHASE-4.md) การทดสอบพร้อมกันที่เพิ่มใน Phase 4 เป็นการสร้าง Book Set ซ้ำ ไม่ใช่ระบบจองคิวของ Phase 5

ด้านล่างเป็นผลและข้อจำกัด ณ วันที่ส่ง Phase 2 เก็บไว้เป็นประวัติ ข้อความว่ายังไม่มี MySQL ไม่ใช่สถานะเครื่องปัจจุบัน

## ขอบเขตการส่งมอบ

สร้าง schema และเอกสารแล้ว แต่ยังไม่ยืนยันว่ารัน SQL ผ่านบน MySQL จริง ไม่ควรถือว่าการทดสอบฐานข้อมูลเสร็จสมบูรณ์จนกว่าจะรัน tests.sql ได้ผลผ่านครบ

## รายการตรวจ

| รายการ | ผล |
| --- | --- |
| ตรวจ hash ไฟล์จาก Phase 1 | ผ่าน: เปลี่ยนเพียง README.md และ database/README.md |
| Syntax ของ backend/server.js และ frontend/assets/app.js | ผ่านด้วย node --check |
| Smoke check การสร้าง UI ทั้ง 7 หน้าและลิงก์ภายใน | ผ่านด้วยสคริปต์ตรวจ Phase 1 เดิม |
| เมนู แสดง/ซ่อนรหัสผ่าน ข้อความ Login แบบ UI | ผ่าน smoke check แบบจำลอง DOM เดิม |
| รายชื่อตาราง/คอลัมน์, PK, FK, ชนิดข้อมูล, คีย์แม่, InnoDB/utf8mb4 | ผ่าน static checks: 10 ตาราง, 9 Foreign Key, ชนิดตรงกัน และ parent key เป็น PK/UNIQUE |
| SQL CREATE TABLE และ tests.sql บน MySQL | ยังไม่ได้รัน |
| การแข่งขันจองพร้อมกันสอง connection | ยังไม่ได้รัน |
| Browser visual/layout | ไม่ได้ทดสอบเพิ่ม เพราะไม่แก้ UI |

## สภาพแวดล้อมและข้อจำกัด

ไม่พบคำสั่ง mysql, mysqld, Docker หรือบริการ MySQL/MariaDB และไม่พบไฟล์ MySQL ในตำแหน่งติดตั้งทั่วไปที่ตรวจ WSL ไม่มี distribution พร้อมใช้ พยายามดาวน์โหลด MySQL portable จากแหล่งทางการแล้วแต่ URL ที่ลองตอบ HTTP 404 จึงยังไม่มี MySQL engine สำหรับทดสอบ

การตรวจโครงสร้างเป็นการอ่าน SQL ตรวจตาราง/คอลัมน์/คีย์ด้วยสคริปต์ ไม่ใช่ MySQL parser และไม่ใช่การ import สำเร็จ จึงไม่ใช้ผลนี้แทนผลทดสอบจริง

## ขั้นตอนที่ต้องผ่านก่อน Phase 3

1. ใช้ MySQL 8.0.16 ขึ้นไปหรือ 8.4 สร้างฐานใหม่และ import schema.sql ตาม README.md
2. ต้องเห็นครบ 10 ตารางและไม่มี ERROR
3. สร้างฐานทดสอบเปล่าชื่อ college_book_queue_phase2_test แล้ว import schema.sql และ tests.sql
4. ต้องได้ PASS ทุกกรณีและ ALL PHASE 2 SQL TESTS PASSED โดยไม่มี ERROR
5. หากพบข้อผิดพลาด ให้แก้เฉพาะ SQL/เอกสารที่เกี่ยวข้องก่อนเริ่มเชื่อมต่อ Login

tests.sql เตรียมกรณีจองซ้ำในและข้ามรอบ รวมการเปลี่ยนสถานะที่ชน Unique Key แล้ว ส่วนการทดสอบพร้อมกันหลาย connection และความจุรอบต้องเพิ่มเมื่อทำ transaction ของระบบ Booking ใน Phase 6
