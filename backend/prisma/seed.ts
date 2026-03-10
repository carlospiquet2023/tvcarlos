import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const adminPassword = await bcrypt.hash('!Senha123', 12);
    const studentPassword = await bcrypt.hash('student123', 10);

    // Create Admin (username: plataforma / senha: !Senha123)
    const admin = await prisma.user.upsert({
        where: { email: 'carlospiquet.projetos@gmail.com' },
        update: {
            username: 'plataforma',
            password: adminPassword,
        },
        create: {
            username: 'plataforma',
            email: 'carlospiquet.projetos@gmail.com',
            name: 'Carlos Antonio de Oliveira Piquet',
            password: adminPassword,
            role: Role.ADMIN,
        },
    });

    // Create Student
    const student = await prisma.user.upsert({
        where: { email: 'aluno@instituicao.com' },
        update: {},
        create: {
            email: 'aluno@instituicao.com',
            name: 'Aluno Teste',
            password: studentPassword,
            role: Role.STUDENT,
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

    console.log('Seed executed: Admin and Student created, Course registered.');
    console.log(`Admin login => username: plataforma | email: ${admin.email}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
