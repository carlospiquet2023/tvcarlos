import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const adminEmail = process.env.ADMIN_INITIAL_EMAIL?.trim().toLowerCase();
    const adminUsername = process.env.ADMIN_INITIAL_USERNAME?.trim();
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;

    if (!adminEmail || !adminUsername || !initialPassword) {
        throw new Error(
            'Seed seguro exige ADMIN_INITIAL_EMAIL, ADMIN_INITIAL_USERNAME e ADMIN_INITIAL_PASSWORD.'
        );
    }
    if (initialPassword.length < 12
        || !/[A-Z]/.test(initialPassword)
        || !/[a-z]/.test(initialPassword)
        || !/[0-9]/.test(initialPassword)
        || !/[^A-Za-z0-9]/.test(initialPassword)) {
        throw new Error('ADMIN_INITIAL_PASSWORD deve ter 12+ caracteres, maiúscula, minúscula, número e símbolo.');
    }

    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingAdmin && existingAdmin.role !== 'ADMIN') {
        throw new Error('ADMIN_INITIAL_EMAIL já pertence a uma conta sem papel ADMIN; escolha outro e-mail.');
    }

    // Nunca redefine a senha de uma conta já existente ao reiniciar o seed.
    const admin = existingAdmin ?? await prisma.user.create({
        data: {
            username: adminUsername,
            email: adminEmail,
            name: process.env.ADMIN_INITIAL_NAME?.trim() || 'Administrador da Plataforma',
            password: await bcrypt.hash(initialPassword, 12),
            role: 'ADMIN',
        },
    });

    if (process.env.SEED_DEMO_DATA !== 'true') {
        console.log(`Seed concluído: administrador ${admin.email} disponível.`);
        return;
    }

    const demoPassword = process.env.DEMO_STUDENT_PASSWORD;
    if (!demoPassword || demoPassword.length < 12) {
        throw new Error('SEED_DEMO_DATA=true exige DEMO_STUDENT_PASSWORD com pelo menos 12 caracteres.');
    }
    const studentPassword = await bcrypt.hash(demoPassword, 12);

    // Dados demonstrativos são opt-in e nunca usados por padrão em produção.
    const student = await prisma.user.upsert({
        where: { email: 'aluno@instituicao.com' },
        update: {},
        create: {
            email: 'aluno@instituicao.com',
            name: 'Aluno Teste',
            password: studentPassword,
            role: 'STUDENT',
        },
    });

    // ISSUE-02: Curso idempotente via findFirst + create
    let course = await prisma.course.findFirst({
        where: { name: 'Curso de Direito Administrativo' }
    });

    if (!course) {
        course = await prisma.course.create({
            data: {
                name: 'Curso de Direito Administrativo',
                description: 'Curso completo preparatório de Direito',
                modules: {
                    create: [
                        { name: 'Módulo 1 - Introdução' },
                        { name: 'Módulo 2 - Avançado' },
                    ],
                },
            },
        });
    }

    // Enroll Student (idempotente via upsert)
    await prisma.courseEnrollment.upsert({
        where: { userId_courseId: { userId: student.id, courseId: course.id } },
        update: {},
        create: {
            userId: student.id,
            courseId: course.id,
        },
    });

    console.log('Seed demonstrativo concluído: administrador, aluno e curso registrados.');
    console.log(`Administrador: ${admin.email}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
