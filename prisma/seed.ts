import { PrismaClient, UserRole, SlotStatus, ConsultationStatus, PaymentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptData, generateHmacSignature } from '../src/shared/security/crypto.js';
import { env } from '../src/config/environment.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Amrutam Telemedicine database...');

  const passwordHash = await bcrypt.hash('AmrutamSecure2026!', 10);

  // 1. Admin Account
  const admin = await prisma.user.upsert({
    where: { email: 'admin@amrutam.co.in' },
    update: {},
    create: {
      email: 'admin@amrutam.co.in',
      passwordHash,
      role: UserRole.ADMIN,
      profile: {
        create: {
          firstName: 'System',
          lastName: 'Administrator',
          phone: '+919999900001',
        },
      },
    },
  });
  console.log(`✓ Seeded Admin: ${admin.email}`);

  // 2. Verified Doctors
  const doctorsData = [
    {
      email: 'dr.sharma@amrutam.co.in',
      firstName: 'Dr. Vaidya',
      lastName: 'Sharma',
      licenseNumber: 'AYUR-DL-2015-8841',
      specialties: ['Ayurveda', 'Panchakarma', 'Digestive Health'],
      experienceYears: 14,
      consultationFee: 750.0,
      bio: 'Senior Ayurvedic physician specializing in holistic gut microbiome restoration, chronic acidity, and classical Panchakarma detoxification protocols.',
      rating: 4.95,
      totalReviews: 128,
    },
    {
      email: 'dr.ananya@amrutam.co.in',
      firstName: 'Dr. Ananya',
      lastName: 'Iyer',
      licenseNumber: 'AYUR-KA-2018-9120',
      specialties: ['Ayurveda', 'Dermatology', 'Stress Management'],
      experienceYears: 9,
      consultationFee: 600.0,
      bio: 'Specialist in Ayurvedic skin therapies, hormonal balance, lifestyle counseling, and chronic eczema management.',
      rating: 4.88,
      totalReviews: 94,
    },
    {
      email: 'dr.rajesh@amrutam.co.in',
      firstName: 'Dr. Rajesh',
      lastName: 'Mehta',
      licenseNumber: 'AYUR-MH-2012-6502',
      specialties: ['Ayurveda', 'Joint & Spine Care', 'Geriatric Wellness'],
      experienceYears: 16,
      consultationFee: 850.0,
      bio: 'Expert Ayurvedic orthopedics consultant focusing on arthritis, spondylosis, and herbal pain management without steroid intervention.',
      rating: 4.92,
      totalReviews: 210,
    },
  ];

  const seededDoctors: Array<{ id: string; userId: string; email: string }> = [];

  for (const doc of doctorsData) {
    const user = await prisma.user.upsert({
      where: { email: doc.email },
      update: {},
      create: {
        email: doc.email,
        passwordHash,
        role: UserRole.DOCTOR,
        profile: {
          create: {
            firstName: doc.firstName,
            lastName: doc.lastName,
            phone: '+919876500000',
          },
        },
        doctor: {
          create: {
            licenseNumber: doc.licenseNumber,
            specialties: doc.specialties,
            experienceYears: doc.experienceYears,
            consultationFee: doc.consultationFee,
            bio: doc.bio,
            isVerified: true,
            rating: doc.rating,
            totalReviews: doc.totalReviews,
          },
        },
      },
      include: { doctor: true },
    });

    seededDoctors.push({
      id: user.doctor!.id,
      userId: user.id,
      email: user.email,
    });
    console.log(`✓ Seeded Doctor: ${doc.firstName} ${doc.lastName} (${doc.email})`);
  }

  // 3. Patients
  const patient1 = await prisma.user.upsert({
    where: { email: 'rahul.verma@example.com' },
    update: {},
    create: {
      email: 'rahul.verma@example.com',
      passwordHash,
      role: UserRole.PATIENT,
      profile: {
        create: {
          firstName: 'Rahul',
          lastName: 'Verma',
          phone: '+919811223344',
          gender: 'Male',
          bloodGroup: 'B+',
        },
      },
    },
  });

  const patient2 = await prisma.user.upsert({
    where: { email: 'sneha.patel@example.com' },
    update: {},
    create: {
      email: 'sneha.patel@example.com',
      passwordHash,
      role: UserRole.PATIENT,
      profile: {
        create: {
          firstName: 'Sneha',
          lastName: 'Patel',
          phone: '+919822334455',
          gender: 'Female',
          bloodGroup: 'O+',
        },
      },
    },
  });
  console.log(`✓ Seeded Patients: ${patient1.email}, ${patient2.email}`);

  // 4. Availability Slots (10 future slots for each doctor)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  for (const doc of seededDoctors) {
    for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
      for (let slotHour = 10; slotHour <= 14; slotHour += 1) {
        const start = new Date();
        start.setDate(start.getDate() + dayOffset);
        start.setHours(slotHour, 0, 0, 0);

        const end = new Date(start);
        end.setMinutes(end.getMinutes() + 30);

        await prisma.availabilitySlot.upsert({
          where: {
            doctorId_startTime_endTime: {
              doctorId: doc.id,
              startTime: start,
              endTime: end,
            },
          },
          update: {},
          create: {
            doctorId: doc.id,
            startTime: start,
            endTime: end,
            status: SlotStatus.AVAILABLE,
          },
        });
      }
    }
  }
  console.log(`✓ Seeded 45 future availability slots across all doctors.`);

  // 5. Seed a Sample Completed Consultation with Encrypted Prescription
  const demoDoctor = seededDoctors[0]!;
  const demoSlotStart = new Date(Date.now() - 3600000);
  const demoSlotEnd = new Date(Date.now() - 1800000);

  const bookedSlot = await prisma.availabilitySlot.create({
    data: {
      doctorId: demoDoctor.id,
      startTime: demoSlotStart,
      endTime: demoSlotEnd,
      status: SlotStatus.BOOKED,
    },
  });

  const demoConsultation = await prisma.consultation.create({
    data: {
      bookingReference: 'AMR-20261019-DEMO01',
      patientId: patient1.id,
      doctorId: demoDoctor.id,
      slotId: bookedSlot.id,
      status: ConsultationStatus.COMPLETED,
      scheduledStartTime: demoSlotStart,
      scheduledEndTime: demoSlotEnd,
      actualStartTime: demoSlotStart,
      actualEndTime: demoSlotEnd,
      meetingLink: 'https://meet.amrutam.co.in/room/AMR-20261019-DEMO01',
      notes: 'Initial consultation completed. Patient presented with digestive sluggishness.',
    },
  });

  await prisma.payment.create({
    data: {
      consultationId: demoConsultation.id,
      amount: 750.0,
      currency: 'INR',
      status: PaymentStatus.SUCCESS,
      transactionId: 'txn_demo_789456123',
      idempotencyKey: `idem_seed_${demoConsultation.id}`,
    },
  });

  // Create Encrypted Prescription
  const rawDiagnosis = 'Agni Mandya (Sluggish Digestive Fire) with secondary Pitta aggravation';
  const medicationsList = [
    {
      name: 'Amrutam Kuntal Care Herbal Malt',
      dosage: '1 tablespoon',
      frequency: 'Twice daily with lukewarm water',
      durationDays: 30,
      instructions: 'Consume 15 minutes before breakfast and dinner',
    },
    {
      name: 'Triphala Guggulu',
      dosage: '2 tablets',
      frequency: 'Once before bed',
      durationDays: 21,
      instructions: 'Take with warm water',
    },
  ];
  const advice = 'Drink 2.5L lukewarm water daily. Avoid deep-fried, sour, and excessively spicy foods.';

  const encryptedDiagnosis = encryptData(rawDiagnosis, env.DATA_ENCRYPTION_KEY);
  const encryptedMeds = encryptData(JSON.stringify(medicationsList), env.DATA_ENCRYPTION_KEY);
  const encryptedAdvice = encryptData(advice, env.DATA_ENCRYPTION_KEY);
  const signature = generateHmacSignature(
    `${demoDoctor.id}:${demoConsultation.id}:${rawDiagnosis}:${JSON.stringify(medicationsList)}`,
    env.DATA_ENCRYPTION_KEY
  );

  await prisma.prescription.create({
    data: {
      consultationId: demoConsultation.id,
      doctorId: demoDoctor.id,
      patientId: patient1.id,
      diagnosis: encryptedDiagnosis,
      medications: encryptedMeds,
      advice: encryptedAdvice,
      digitalSignature: signature,
      version: 1,
      isImmutable: true,
    },
  });

  console.log(`✓ Seeded Demo Consultation & Encrypted Prescription (${demoConsultation.bookingReference})`);
  console.log('\nDatabase seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
