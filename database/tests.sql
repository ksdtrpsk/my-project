-- Run ONLY in a new empty database named college_book_queue_phase2_test.
-- Import schema.sql first. Run this whole file in one connection.
-- No permanent fixture data: the suite uses a transaction and ROLLBACK.
SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

DELIMITER $$

CREATE PROCEDURE phase2_assert(IN passed BOOLEAN, IN test_name VARCHAR(128))
BEGIN
    IF passed IS NULL OR passed = FALSE THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = test_name;
    END IF;
    SELECT CONCAT('PASS: ', test_name) AS result;
END$$

CREATE PROCEDURE phase2_expect_error(IN statement_text TEXT, IN expected_errno INT, IN test_name VARCHAR(128))
BEGIN
    DECLARE actual_errno INT DEFAULT 0;
    SET @phase2_statement = statement_text;
    PREPARE phase2_query FROM @phase2_statement;
    BEGIN
        DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
            GET DIAGNOSTICS CONDITION 1 actual_errno = MYSQL_ERRNO;
        EXECUTE phase2_query;
    END;
    DEALLOCATE PREPARE phase2_query;
    CALL phase2_assert(actual_errno = expected_errno, test_name);
END$$

CREATE PROCEDURE phase2_run_tests()
BEGIN
    DECLARE row_count_value INT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF DATABASE() IS NULL OR DATABASE() <> 'college_book_queue_phase2_test' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Select college_book_queue_phase2_test before running tests';
    END IF;

    SELECT (SELECT COUNT(*) FROM departments) + (SELECT COUNT(*) FROM education_levels)
         + (SELECT COUNT(*) FROM classrooms) + (SELECT COUNT(*) FROM students)
         + (SELECT COUNT(*) FROM books) + (SELECT COUNT(*) FROM book_sets)
         + (SELECT COUNT(*) FROM book_set_items) + (SELECT COUNT(*) FROM booking_slots)
         + (SELECT COUNT(*) FROM bookings) + (SELECT COUNT(*) FROM admins)
    INTO row_count_value;
    CALL phase2_assert(row_count_value = 0, 'Test database is empty');

    START TRANSACTION;
    INSERT INTO departments (department_id, department_name) VALUES
        (1, 'เทคโนโลยีสารสนเทศ'), (2, 'การบัญชี');
    INSERT INTO education_levels (education_level_id, education_level_name) VALUES (1, 'ปวส.2');
    INSERT INTO classrooms (classroom_id, department_id, education_level_id, classroom_name) VALUES
        (1, 1, 1, 'ปวส.2/1'), (2, 2, 1, 'ปวส.2/1');
    -- Deliberately unusable hash markers; these are NOT login credentials.
    INSERT INTO students (student_id, student_code, password, first_name, last_name, department_id, education_level_id, classroom_id) VALUES
        (1, '66309010001', 'TEST_ONLY_NOT_A_LOGIN_HASH', 'สมชาย', 'ใจดี', 1, 1, 1),
        (2, '66309010002', 'TEST_ONLY_NOT_A_LOGIN_HASH', 'สมหญิง', 'เรียนดี', 1, 1, 1);
    INSERT INTO books (book_id, book_name, book_code) VALUES (1, 'การพัฒนาเว็บไซต์', 'TEST-BOOK-001');
    INSERT INTO book_sets (book_set_id, department_id, education_level_id, classroom_id, semester, academic_year) VALUES
        (1, 1, 1, 1, 1, 2569), (2, 1, 1, 1, 2, 2569);
    INSERT INTO book_set_items (id, book_set_id, book_id) VALUES (1, 1, 1), (2, 2, 1);
    INSERT INTO booking_slots (slot_id, booking_date, start_time, end_time, max_students) VALUES
        (1, '2026-09-15', '09:00:00', '09:30:00', 20),
        (2, '2026-09-15', '09:30:00', '10:00:00', 20);
    INSERT INTO admins (admin_id, username, password, name) VALUES
        (1, 'test_admin', 'TEST_ONLY_NOT_A_LOGIN_HASH', 'เจ้าหน้าที่ทดสอบ');

    SELECT COUNT(*) INTO row_count_value FROM students WHERE first_name = 'สมชาย';
    CALL phase2_assert(row_count_value = 1, 'Thai text round trip');
    CALL phase2_expect_error('INSERT INTO students (student_code,password,first_name,last_name,department_id,education_level_id,classroom_id) VALUES (''66309010001'',''x'',''A'',''B'',1,1,1)', 1062, 'Reject duplicate student code');
    CALL phase2_expect_error('INSERT INTO students (student_code,password,first_name,last_name,department_id,education_level_id,classroom_id) VALUES (''NEW'',''x'',''A'',''B'',2,1,1)', 1452, 'Reject mismatched student classroom group');
    CALL phase2_expect_error('INSERT INTO book_sets (department_id,education_level_id,classroom_id,semester,academic_year) VALUES (2,1,1,1,2569)', 1452, 'Reject mismatched book set classroom group');
    CALL phase2_expect_error('INSERT INTO book_sets (department_id,education_level_id,classroom_id,semester,academic_year) VALUES (1,1,1,1,2569)', 1062, 'Reject duplicate group and term');
    CALL phase2_expect_error('INSERT INTO book_set_items (book_set_id,book_id) VALUES (1,1)', 1062, 'Reject duplicate book inside set');
    CALL phase2_expect_error('INSERT INTO book_set_items (book_set_id,book_id) VALUES (1,999)', 1452, 'Reject nonexistent book');
    CALL phase2_expect_error('INSERT INTO book_sets (department_id,education_level_id,classroom_id,semester,academic_year) VALUES (1,1,1,0,2569)', 3819, 'Reject invalid semester');
    CALL phase2_expect_error('INSERT INTO book_sets (department_id,education_level_id,classroom_id,semester,academic_year) VALUES (1,1,1,1,2026)', 3819, 'Reject Gregorian academic year');
    CALL phase2_expect_error('UPDATE booking_slots SET max_students = 0 WHERE slot_id = 1', 3819, 'Reject zero slot capacity');
    CALL phase2_expect_error('UPDATE booking_slots SET end_time = start_time WHERE slot_id = 1', 3819, 'Reject empty or reversed time range');
    CALL phase2_expect_error('UPDATE booking_slots SET status = ''INVALID'' WHERE slot_id = 1', 3819, 'Reject invalid slot status');

    INSERT INTO bookings (booking_id, student_id, slot_id, book_set_id, queue_number) VALUES (1, 1, 1, 1, 'A001');
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (1,1,1,''A002'')', 1062, 'Reject same student set in same slot');
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (1,2,1,''A002'')', 1062, 'Reject same student set across slots');
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (2,1,1,''A001'')', 1062, 'Reject duplicate queue inside slot');
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (999,1,1,''A009'')', 1452, 'Reject nonexistent student');
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (2,999,1,''A009'')', 1452, 'Reject nonexistent slot');
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (2,1,999,''A009'')', 1452, 'Reject nonexistent set');
    CALL phase2_expect_error('UPDATE bookings SET booking_status = ''INVALID'' WHERE booking_id = 1', 3819, 'Reject invalid booking status');

    UPDATE bookings SET booking_status = 'CHECKED_IN' WHERE booking_id = 1;
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (1,2,1,''A002'')', 1062, 'Checked-in booking retains uniqueness');
    UPDATE bookings SET booking_status = 'RECEIVED' WHERE booking_id = 1;
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (1,2,1,''A002'')', 1062, 'Received booking prevents repeat pickup');
    UPDATE bookings SET booking_status = 'NO_SHOW' WHERE booking_id = 1;
    CALL phase2_expect_error('INSERT INTO bookings (student_id,slot_id,book_set_id,queue_number) VALUES (1,2,1,''A002'')', 1062, 'No-show remains blocked pending admin decision');

    -- Direct status changes here exercise constraints, not a future booking API.
    UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = 1;
    INSERT INTO bookings (booking_id,student_id,slot_id,book_set_id,queue_number) VALUES (100,1,2,1,'A002');
    SELECT COUNT(*) INTO row_count_value FROM bookings WHERE student_id = 1 AND book_set_id = 1;
    CALL phase2_assert(row_count_value = 2, 'Cancellation preserves history and permits rebooking');
    CALL phase2_expect_error('UPDATE bookings SET booking_status = ''WAITING'' WHERE booking_id = 1', 1062, 'Cannot reactivate cancelled booking while another exists');
    UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = 100;
    INSERT INTO bookings (booking_id,student_id,slot_id,book_set_id,queue_number) VALUES (101,1,2,1,'A003');
    SELECT COUNT(*) INTO row_count_value FROM bookings WHERE booking_guard IS NULL;
    CALL phase2_assert(row_count_value = 2, 'Multiple cancelled history rows are allowed');

    INSERT INTO bookings (booking_id,student_id,slot_id,book_set_id,queue_number) VALUES
        (102,1,1,2,'B001'), (103,2,1,1,'A004');
    SELECT COUNT(*) INTO row_count_value FROM bookings WHERE booking_guard = 1;
    CALL phase2_assert(row_count_value = 3, 'Other student and other book set are allowed');
    SELECT COUNT(*) INTO row_count_value FROM bookings WHERE qr_code IS NULL;
    CALL phase2_assert(row_count_value = 5, 'QR token can be absent for multiple bookings');
    UPDATE bookings SET qr_code = 'test-token-unique' WHERE booking_id = 101;
    CALL phase2_expect_error('UPDATE bookings SET qr_code = ''test-token-unique'' WHERE booking_id = 102', 1062, 'Reject reused QR token');
    CALL phase2_expect_error('UPDATE bookings SET qr_code = '''' WHERE booking_id = 102', 3819, 'Reject empty QR token');
    CALL phase2_expect_error('DELETE FROM students WHERE student_id = 1', 1451, 'Keep student referenced by booking');
    CALL phase2_expect_error('DELETE FROM booking_slots WHERE slot_id = 1', 1451, 'Keep slot referenced by booking');
    CALL phase2_expect_error('DELETE FROM book_sets WHERE book_set_id = 1', 1451, 'Keep referenced book set');
    CALL phase2_expect_error('DELETE FROM books WHERE book_id = 1', 1451, 'Keep book referenced by set');
    ROLLBACK;
    SELECT COUNT(*) INTO row_count_value FROM bookings;
    CALL phase2_assert(row_count_value = 0, 'Fixture bookings rolled back');
    SELECT 'ALL PHASE 2 SQL TESTS PASSED' AS result;
END$$

DELIMITER ;

CALL phase2_run_tests();

-- These routines belong only to the test suite, not to the application.
DROP PROCEDURE phase2_run_tests;
DROP PROCEDURE phase2_expect_error;
DROP PROCEDURE phase2_assert;
