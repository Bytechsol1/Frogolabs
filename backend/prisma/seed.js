"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Seeding database...');
    const adminHash = await bcrypt.hash('admin123', 10);
    const demoHash = await bcrypt.hash('demo123', 10);
    await prisma.user.upsert({
        where: { email: 'admin@frigolabs.com' },
        update: { password_hash: adminHash },
        create: { email: 'admin@frigolabs.com', name: 'Frigo Admin', password_hash: adminHash, role: 'ADMIN' },
    });
    const c1 = await prisma.clinic.upsert({
        where: { email: 'emily@austinfamily.com' },
        update: {},
        create: { name: 'Austin Family Clinic', contact_name: 'Dr. Emily Carter', email: 'emily@austinfamily.com', phone: '(512) 555-0182', status: 'Active' },
    });
    await prisma.user.upsert({
        where: { email: 'emily@austinfamily.com' },
        update: {},
        create: { email: 'emily@austinfamily.com', name: 'Dr. Emily Carter', password_hash: demoHash, role: 'CLINIC_USER', clinic_id: c1.id },
    });
    const c2 = await prisma.clinic.upsert({
        where: { email: 'mark@greenvalley.com' },
        update: {},
        create: { name: 'Green Valley Clinic', contact_name: 'Mark Johnson', email: 'mark@greenvalley.com', phone: '(214) 555-0129', status: 'Active' },
    });
    await prisma.user.upsert({
        where: { email: 'mark@greenvalley.com' },
        update: {},
        create: { email: 'mark@greenvalley.com', name: 'Mark Johnson', password_hash: demoHash, role: 'CLINIC_USER', clinic_id: c2.id },
    });
    const c3 = await prisma.clinic.upsert({
        where: { email: 'sarah@westside.com' },
        update: {},
        create: { name: 'Westside Health Center', contact_name: 'Sarah Lee', email: 'sarah@westside.com', phone: '(310) 555-0164', status: 'Active' },
    });
    await prisma.user.upsert({
        where: { email: 'sarah@westside.com' },
        update: {},
        create: { email: 'sarah@westside.com', name: 'Sarah Lee', password_hash: demoHash, role: 'CLINIC_USER', clinic_id: c3.id },
    });
    async function seedPatient(clinicId, p, test_type, status) {
        const existing = await prisma.patient.findFirst({ where: { email: p.email } });
        if (existing)
            return;
        await prisma.patient.create({
            data: {
                first_name: p.first_name,
                last_name: p.last_name,
                email: p.email,
                phone: p.phone,
                dob: new Date(p.dob),
                clinic_id: clinicId,
                workflows: {
                    create: { clinic_id: clinicId, test_type, status: status },
                },
            },
        });
    }
    await seedPatient(c1.id, { first_name: 'James', last_name: 'Carter', email: 'james.carter@mail.com', phone: '(512) 555-0101', dob: '1985-03-15' }, 'Tasso+ Basic Panel', 'COMPLETED');
    await seedPatient(c1.id, { first_name: 'Linda', last_name: 'Park', email: 'linda.park@mail.com', phone: '(512) 555-0102', dob: '1990-07-22' }, 'Tasso+ Comprehensive Panel', 'RESULTS_READY');
    await seedPatient(c1.id, { first_name: 'Robert', last_name: 'Hayes', email: 'robert.hayes@mail.com', phone: '(512) 555-0103', dob: '1978-11-08' }, 'Tasso+ DNA Analysis', 'LAB_PROCESSING');
    await seedPatient(c1.id, { first_name: 'Olivia', last_name: 'Scott', email: 'olivia.scott@mail.com', phone: '(512) 555-0104', dob: '1995-04-30' }, 'Standard Lab Screening', 'SAMPLE_COLLECTED');
    await seedPatient(c1.id, { first_name: 'David', last_name: 'Chen', email: 'david.chen@mail.com', phone: '(512) 555-0105', dob: '1982-09-12' }, 'Tasso+ Basic Panel', 'KIT_SHIPPED');
    await seedPatient(c1.id, { first_name: 'Maria', last_name: 'Garcia', email: 'maria.garcia@mail.com', phone: '(512) 555-0106', dob: '1998-01-25' }, 'Tasso+ Comprehensive Panel', 'TASSO_INSTRUCTIONS_SENT');
    await seedPatient(c1.id, { first_name: 'Kevin', last_name: 'Williams', email: 'kevin.williams@mail.com', phone: '(512) 555-0107', dob: '1975-06-18' }, 'Tasso+ DNA Analysis', 'TEST_PACKAGE_SELECTED');
    await seedPatient(c1.id, { first_name: 'Sophie', last_name: 'Turner', email: 'sophie.turner@mail.com', phone: '(512) 555-0108', dob: '1993-12-05' }, 'Standard Lab Screening', 'COMPLETED');
    await seedPatient(c1.id, { first_name: 'Andrew', last_name: 'Kim', email: 'andrew.kim@mail.com', phone: '(512) 555-0109', dob: '1988-08-14' }, 'Tasso+ Basic Panel', 'RESULTS_READY');
    await seedPatient(c1.id, { first_name: 'Nicole', last_name: 'Brown', email: 'nicole.brown@mail.com', phone: '(512) 555-0110', dob: '2000-02-28' }, 'Tasso+ Comprehensive Panel', 'LAB_PROCESSING');
    await seedPatient(c2.id, { first_name: 'Thomas', last_name: 'Reed', email: 'thomas.reed@mail.com', phone: '(214) 555-0201', dob: '1983-05-20' }, 'Tasso+ DNA Analysis', 'COMPLETED');
    await seedPatient(c2.id, { first_name: 'Emma', last_name: 'Watson', email: 'emma.watson@mail.com', phone: '(214) 555-0202', dob: '1991-10-03' }, 'Standard Lab Screening', 'RESULTS_READY');
    await seedPatient(c2.id, { first_name: 'Lucas', last_name: 'Miller', email: 'lucas.miller@mail.com', phone: '(214) 555-0203', dob: '1979-07-17' }, 'Tasso+ Basic Panel', 'LAB_PROCESSING');
    await seedPatient(c2.id, { first_name: 'Hannah', last_name: 'White', email: 'hannah.white@mail.com', phone: '(214) 555-0204', dob: '1996-03-09' }, 'Tasso+ Comprehensive Panel', 'SAMPLE_COLLECTED');
    await seedPatient(c2.id, { first_name: 'Ryan', last_name: 'Martinez', email: 'ryan.martinez@mail.com', phone: '(214) 555-0205', dob: '1987-11-24' }, 'Tasso+ DNA Analysis', 'KIT_SHIPPED');
    await seedPatient(c2.id, { first_name: 'Chloe', last_name: 'Adams', email: 'chloe.adams@mail.com', phone: '(214) 555-0206', dob: '1994-06-13' }, 'Standard Lab Screening', 'TASSO_INSTRUCTIONS_SENT');
    await seedPatient(c2.id, { first_name: 'Ethan', last_name: 'Clark', email: 'ethan.clark@mail.com', phone: '(214) 555-0207', dob: '2001-01-07' }, 'Tasso+ Basic Panel', 'TEST_PACKAGE_SELECTED');
    await seedPatient(c2.id, { first_name: 'Ava', last_name: 'Johnson', email: 'ava.johnson@mail.com', phone: '(214) 555-0208', dob: '1984-09-29' }, 'Tasso+ Comprehensive Panel', 'COMPLETED');
    await seedPatient(c2.id, { first_name: 'Noah', last_name: 'Wilson', email: 'noah.wilson@mail.com', phone: '(214) 555-0209', dob: '1977-04-16' }, 'Tasso+ DNA Analysis', 'RESULTS_READY');
    await seedPatient(c2.id, { first_name: 'Isabella', last_name: 'Lee', email: 'isabella.lee@mail.com', phone: '(214) 555-0210', dob: '1999-08-31' }, 'Standard Lab Screening', 'LAB_PROCESSING');
    await seedPatient(c3.id, { first_name: 'Mason', last_name: 'Thompson', email: 'mason.thompson@mail.com', phone: '(310) 555-0301', dob: '1986-02-11' }, 'Tasso+ Basic Panel', 'COMPLETED');
    await seedPatient(c3.id, { first_name: 'Sophia', last_name: 'Rodriguez', email: 'sophia.rodriguez@mail.com', phone: '(310) 555-0302', dob: '1992-06-27' }, 'Tasso+ Comprehensive Panel', 'RESULTS_READY');
    await seedPatient(c3.id, { first_name: 'Liam', last_name: 'Jackson', email: 'liam.jackson@mail.com', phone: '(310) 555-0303', dob: '1980-12-19' }, 'Tasso+ DNA Analysis', 'LAB_PROCESSING');
    await seedPatient(c3.id, { first_name: 'Charlotte', last_name: 'Harris', email: 'charlotte.harris@mail.com', phone: '(310) 555-0304', dob: '1997-04-05' }, 'Standard Lab Screening', 'SAMPLE_COLLECTED');
    await seedPatient(c3.id, { first_name: 'Benjamin', last_name: 'Lewis', email: 'benjamin.lewis@mail.com', phone: '(310) 555-0305', dob: '1989-10-23' }, 'Tasso+ Basic Panel', 'KIT_SHIPPED');
    await seedPatient(c3.id, { first_name: 'Amelia', last_name: 'Robinson', email: 'amelia.robinson@mail.com', phone: '(310) 555-0306', dob: '2002-07-14' }, 'Tasso+ Comprehensive Panel', 'TASSO_INSTRUCTIONS_SENT');
    await seedPatient(c3.id, { first_name: 'Elijah', last_name: 'Young', email: 'elijah.young@mail.com', phone: '(310) 555-0307', dob: '1976-03-02' }, 'Tasso+ DNA Analysis', 'TEST_PACKAGE_SELECTED');
    await seedPatient(c3.id, { first_name: 'Mia', last_name: 'Allen', email: 'mia.allen@mail.com', phone: '(310) 555-0308', dob: '1994-11-18' }, 'Standard Lab Screening', 'COMPLETED');
    await seedPatient(c3.id, { first_name: 'James', last_name: 'Walker', email: 'james.walker@mail.com', phone: '(310) 555-0309', dob: '1981-05-07' }, 'Tasso+ Basic Panel', 'RESULTS_READY');
    await seedPatient(c3.id, { first_name: 'Abigail', last_name: 'Hall', email: 'abigail.hall@mail.com', phone: '(310) 555-0310', dob: '1998-09-25' }, 'Tasso+ Comprehensive Panel', 'LAB_PROCESSING');
    console.log('\nSeeding complete.');
    console.log('\nDemo accounts (password: demo123):');
    console.log('  emily@austinfamily.com  — Austin Family Clinic  (10 patients)');
    console.log('  mark@greenvalley.com    — Green Valley Clinic   (10 patients)');
    console.log('  sarah@westside.com      — Westside Health Center (10 patients)');
    console.log('\nAdmin (password: admin123):');
    console.log('  admin@frigolabs.com');
}
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
//# sourceMappingURL=seed.js.map