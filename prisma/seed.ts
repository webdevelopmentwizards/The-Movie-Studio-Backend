import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.role.createMany({
    data: [
      { code: 'SUPER_ADMIN' },
      { code: 'USER' },
    ],
    skipDuplicates: true,
  })

  const adminRole = await prisma.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
  if (adminRole) {
    const adminPassword = bcrypt.hashSync('SuperAdmin@2024!', 10);
    const adminEmail = 'admin@themoviestudio.com';

    const admin = await prisma.users.upsert({
      where: { email: adminEmail },
      update: {
        password: adminPassword,
        firstName: 'Movie',
        lastName: 'Studio',
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        roleId: adminRole.id,
        isActive: true,
        isDeleted: false,
        provider: 'EMAIL',
      },
      create: {
        email: adminEmail,
        password: adminPassword,
        firstName: 'Movie',
        lastName: 'Studio',
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        roleId: adminRole.id,
        isActive: true,
        isDeleted: false,
        provider: 'EMAIL',
      },
    });

    console.log('Super Admin account ready:', admin.email);
    console.log('   Email:', adminEmail);
    console.log('   Password: SuperAdmin@2024!');
    console.log('   Role: SUPER_ADMIN');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
