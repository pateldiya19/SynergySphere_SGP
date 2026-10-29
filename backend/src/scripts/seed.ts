import Database from '@/config/database';
import { Project, Task, User } from '@/models';
import { logger } from '@/utils';

async function seedDatabase() {
  try {
    logger.info('Starting database seeding...');

    // Connect to database
    const database = Database.getInstance();
    await database.connect();

    // Clear existing data
    await User.deleteMany({});
    await Project.deleteMany({});
    await Task.deleteMany({});

    // Create users
    const users = await User.create([
      {
        name: 'Alex Rivera',
        email: 'user@example.com',
        password: 'password123',
        avatarUrl: '',
      },
      {
        name: 'Sarah Chen',
        email: 'sarah@example.com',
        password: 'password123',
        avatarUrl: '',
      },
      {
        name: 'Mike Johnson',
        email: 'mike@example.com',
        password: 'password123',
        avatarUrl: '',
      },
      {
        name: 'Emma Davis',
        email: 'emma@example.com',
        password: 'password123',
        avatarUrl: '',
      },
    ]);

    logger.info(`Created ${users.length} users`);

    // Create projects
    const projects = await Project.create([
      {
        name: 'RD Services',
        description: 'Research and Development services for innovative solutions',
        ownerId: users[0]._id,
        tags: ['Services', 'Customer Care'],
        deadline: new Date('2024-03-21'),
        members: [
          { userId: users[0]._id, role: 'owner', joinedAt: new Date() },
          { userId: users[1]._id, role: 'member', joinedAt: new Date() },
          { userId: users[2]._id, role: 'member', joinedAt: new Date() },
        ],
      },
      {
        name: 'Calm Locust',
        description: 'RD Sales platform development and optimization',
        ownerId: users[0]._id,
        tags: ['RD Sales'],
        members: [
          { userId: users[0]._id, role: 'owner', joinedAt: new Date() },
          { userId: users[3]._id, role: 'member', joinedAt: new Date() },
        ],
      },
      {
        name: 'RD Upgrade',
        description: 'System upgrade and migration project',
        ownerId: users[1]._id,
        tags: ['Upgrade', 'Migration'],
        deadline: new Date('2024-03-18'),
        members: [
          { userId: users[1]._id, role: 'owner', joinedAt: new Date() },
          { userId: users[0]._id, role: 'member', joinedAt: new Date() },
        ],
      },
    ]);

    logger.info(`Created ${projects.length} projects`);

    // Create tasks
    const tasks = await Task.create([
      {
        projectId: projects[0]._id,
        title: 'Optimise Website Controllers',
        description: 'Improve performance and efficiency of website controllers',
        assigneeId: users[1]._id,
        dueDate: new Date('2024-03-21'),
        status: 'in_progress',
        priority: 'high',
        tags: ['Feedback', 'Refactor'],
      },
      {
        projectId: projects[0]._id,
        title: 'Design homepage mockup',
        description: 'Create wireframes and high-fidelity mockups for the new homepage',
        assigneeId: users[1]._id,
        dueDate: new Date('2024-03-25'),
        status: 'done',
        priority: 'medium',
        tags: ['Design', 'UI'],
      },
      {
        projectId: projects[1]._id,
        title: 'Fix Authentication Bug',
        description: 'Resolve login issues affecting multiple users',
        assigneeId: users[0]._id,
        dueDate: new Date('2024-03-18'),
        status: 'todo',
        priority: 'high',
        tags: ['Bug', 'Critical'],
      },
      {
        projectId: projects[1]._id,
        title: 'Update User Interface',
        description: 'Modernize the dashboard UI components',
        assigneeId: users[2]._id,
        dueDate: new Date('2024-03-25'),
        status: 'in_progress',
        priority: 'medium',
        tags: ['UI', 'Enhancement'],
      },
      {
        projectId: projects[2]._id,
        title: 'Database Migration',
        description: 'Migrate from old database structure to new schema',
        assigneeId: users[0]._id,
        dueDate: new Date('2024-03-15'),
        status: 'in_progress',
        priority: 'high',
        tags: ['Database', 'Migration'],
      },
    ]);

    logger.info(`Created ${tasks.length} tasks`);

    logger.info('Database seeding completed successfully!');

    // Log sample credentials
    logger.info('\n=== Sample Login Credentials ===');
    logger.info('Email: user@example.com');
    logger.info('Password: password123');
    logger.info('\nOther users:');
    logger.info('- sarah@example.com / password123');
    logger.info('- mike@example.com / password123');
    logger.info('- emma@example.com / password123');
    logger.info('================================\n');

    await database.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seeding
seedDatabase();
