# ฐานข้อมูล — Phase 2

ต่อจาก Phase 1 โดยเพิ่มแบบฐานข้อมูลเท่านั้น หน้าเว็บและเซิร์ฟเวอร์ยังทำงานแบบเดิม ไม่เชื่อม MySQL ไม่สร้าง Login จริง และไม่ทำระบบ Booking

## ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | หน้าที่ |
| --- | --- |
| schema.sql | CREATE TABLE ทั้ง 10 ตาราง พร้อม PK, FK, UNIQUE, CHECK และดัชนี |
| ER-DIAGRAM.md | ER แบบข้อความ/แผนภาพ เหตุผลออกแบบ และกติกาป้องกันจองซ้ำ |
| DATA-DICTIONARY.md | อธิบายคอลัมน์ทุกตาราง |
| tests.sql | ทดสอบข้อจำกัดในฐานทดสอบเปล่า แล้ว rollback ข้อมูล |
| TEST-RESULTS.md | ผลตรวจจริงและข้อจำกัด |
| README.md | วิธีติดตั้งและทดสอบ |

## เงื่อนไขก่อนรัน

- ใช้ MySQL 8.0.16 ขึ้นไป หรือ MySQL 8.4; ไม่ใช้ MySQL 5.7 เพราะ CHECK ไม่ได้บังคับเงื่อนไขแบบที่ต้องการ
- ใช้ InnoDB และ utf8mb4 ตาม schema
- ใช้ MySQL CLI หรือ Workbench ได้ สคริปต์มุ่งเป้า MySQL ไม่ได้รับรอง MariaDB ที่อาจมากับ XAMPP
- ตรวจเวอร์ชันด้วย `SELECT VERSION();`
- สร้างฐานใหม่แยกจากฐานที่มีข้อมูล schema.sql ไม่มี DROP หรือ IF NOT EXISTS เพื่อไม่ซ่อนปัญหาตารางเดิมไม่ตรงกัน

อ้างอิง [CHECK Constraints](https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html) และ [Foreign Key Constraints](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html) ของ MySQL

## สร้างฐานข้อมูลโปรเจ็กต์

เปิด Terminal ในโฟลเดอร์ book-queue แล้วเชื่อมต่อด้วยบัญชี MySQL ของคุณ `-p` จะถามรหัสผ่านฐานข้อมูล ไม่ใช่รหัสผ่านนักศึกษา:

```sh
mysql -u root -p --default-character-set=utf8mb4
```

พิมพ์ใน MySQL CLI:

```sql
CREATE DATABASE college_book_queue
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE college_book_queue;
SET SESSION time_zone = '+07:00';
SOURCE database/schema.sql;
SHOW TABLES;
SHOW CREATE TABLE bookings;
```

ผลที่ควรได้: 10 ตาราง ได้แก่ departments, education_levels, classrooms, students, books, book_sets, book_set_items, booking_slots, bookings, admins โดยไม่มีข้อมูลบัญชีหรือรายการจอง

ถ้าใช้ Workbench ให้รัน CREATE DATABASE, USE และ SET time_zone ก่อน จากนั้นเปิด schema.sql และรันทั้งไฟล์ใน connection เดียวกัน SOURCE เป็นคำสั่ง mysql CLI ไม่ใช่ SQL สำหรับ Workbench

ถ้าฐานมีอยู่แล้วให้ตรวจชื่อและข้อมูลก่อน ไม่ลบทิ้งเพื่อรันซ้ำ หากทดลองรอบใหม่ให้ใช้ฐานใหม่ที่คุณตั้งใจสร้าง

## ทดสอบข้อจำกัดฐานข้อมูล

สร้างฐานทดสอบใหม่แยกจากฐานโปรเจ็กต์ แล้วรันใน MySQL CLI:

```sql
CREATE DATABASE college_book_queue_phase2_test
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE college_book_queue_phase2_test;
SET SESSION time_zone = '+07:00';
SOURCE database/schema.sql;
SOURCE database/tests.sql;
```

ผลที่ควรได้เมื่อทุกกรณีผ่าน: PASS รายกรณี และ `ALL PHASE 2 SQL TESTS PASSED` ตอนท้าย หากมี ERROR ให้ถือว่าไม่ผ่าน แม้ client ยังรันคำสั่งถัดไป อย่าใช้ --force เพื่อมองข้ามข้อผิดพลาด

สคริปต์สร้าง routine ทดสอบ จึงต้องมีสิทธิ์ CREATE ROUTINE, ALTER ROUTINE และ EXECUTE รวมสิทธิ์อ่าน/เขียนตารางในฐานทดสอบ ไม่ต้องให้สิทธิ์ routine กับบัญชี backend ในอนาคต

tests.sql ตรวจชื่อฐานและตารางว่างก่อนเพิ่ม fixture ภายใน transaction จากนั้น ROLLBACK แม้เกิดข้อผิดพลาด Fixture ไม่มีรหัสผ่านล็อกอินจริง ไม่มี seed ในฐานโปรเจ็กต์ ตัวนับ AUTO_INCREMENT อาจสูงขึ้นแม้ rollback จึงต้องใช้ฐานทดสอบโดยเฉพาะ

เมื่อสำเร็จ routine ทดสอบจะถูกลบ ถ้าขัดจังหวะให้ตรวจ routine ที่ค้างชื่อ phase2_run_tests, phase2_expect_error, phase2_assert และแก้ปัญหาก่อนรันซ้ำ อย่าแก้ข้อมูลฐานจริงเพื่อให้ชุดทดสอบผ่าน

ครอบคลุมภาษาไทย, FK กลุ่มไม่ตรงห้อง, รหัสนักศึกษาซ้ำ, หนังสือซ้ำในชุด, กลุ่ม/เทอมซ้ำ, เวลาและความจุ, สถานะผิด, จองซ้ำรอบเดียว/ข้ามรอบ, CHECKED_IN/RECEIVED/NO_SHOW, ยกเลิกแล้วจองใหม่, หลายประวัติยกเลิก, ฟื้นรายการเก่าชนรายการใหม่, เลขคิวซ้ำ, token ซ้ำ และลบรายการแม่ที่ถูกอ้างอิง

## รันเว็บ Phase 1 ต่อ

```sh
npm start
```

เปิด http://localhost:3000 หน้าเว็บยังแสดงข้อมูลสมมติ ไม่ต้องเปิด MySQL เพื่อใช้ UI เดิม ไม่มี API ใหม่ใน Phase 2 จึงไม่มี Method, Endpoint, Input หรือ Output เพิ่มจาก Phase 1

## ไฟล์ที่เพิ่มและแก้

- เพิ่ม database/schema.sql, database/ER-DIAGRAM.md, database/DATA-DICTIONARY.md, database/tests.sql, database/TEST-RESULTS.md
- แก้ database/README.md เป็นคู่มือฉบับนี้
- เพิ่มสรุป Phase 2 ที่ต้น README.md ของโปรเจ็กต์ เก็บรายละเอียด Phase 1 เดิมเป็นประวัติ
- ไม่แก้ frontend, backend/server.js หรือ package.json
- โค้ด/เอกสารฉบับเต็มทุกไฟล์รวมใน PHASE-2-FULL-CODE.md ที่ส่งมอบแยกจากโฟลเดอร์โปรเจ็กต์

## หยุดก่อน Phase 3

Phase 3 จะเชื่อม MySQL และทำ Student Login, ตรวจ hash, Session/Token, Profile และ Logout โดยยังไม่ทำ Booking ยังไม่ได้เริ่ม Phase 3 และต้องตรวจ SQL บน MySQL จริงให้ผ่านก่อนเชื่อมระบบ

## Phase 14
เพิ่ม announcements เป็นตารางที่ 11 ใน schema.sql ฐานเดิมใช้ npm run migrate:phase14 จาก root โปรเจ็กต์เพื่อเพิ่มตารางโดยไม่ล้างข้อมูล ดู ../PHASE-14.md
