import Database from '@/config/database';
import { Project, Task, User } from '@/models';

const TEMP_PASSWORD = 'password123';

type UserSeed = {
  name: string;
  email: string;
  password: string;
};

const USER_SEEDS: UserSeed[] = [
  { name: 'Priya Desai', email: 'pdiya3827@gmail.com', password: TEMP_PASSWORD },
  { name: 'Emma Davis', email: 'emma@example.com', password: TEMP_PASSWORD },
];

const PROJECT_SEEDS = [
  {
    name: 'Temp Shared Sprint',
    description:
      'Temporary shared project for testing dashboard and project membership visibility.',
    tags: ['temp', 'shared', 'qa'],
  },
  {
    name: 'Emma Delivery Board',
    description: 'Temporary project owned by Emma for task ownership and list testing.',
    tags: ['temp', 'delivery'],
  },
  {
    name: 'Priya Ops Backlog',
    description: 'Temporary project owned by Priya for task status and due-date testing.',
    tags: ['temp', 'ops'],
  },
];

async function ensureUsers() {
  const usersByEmail = new Map<string, any>();

  for (const seed of USER_SEEDS) {
    const email = seed.email.toLowerCase();
    let user: any = await User.findOne({ email }).lean();

    if (!user) {
      user = await User.create({
        name: seed.name,
        email,
        password: seed.password,
      });
      console.log(`Created user: ${seed.email}`);
    } else {
      console.log(`User already exists, reused: ${seed.email}`);
    }

    usersByEmail.set(email, user);
  }

  return usersByEmail;
}

async function ensureProject(projectName: string, ownerId: string, memberIds: string[]) {
  let project: any = await Project.findOne({ name: projectName, ownerId }).lean();

  if (!project) {
    const projectSeed = PROJECT_SEEDS.find(seed => seed.name === projectName);
    project = await Project.create({
      name: projectName,
      description: projectSeed?.description ?? 'Temporary project for frontend testing.',
      ownerId,
      tags: projectSeed?.tags ?? ['temp'],
      members: [
        { userId: ownerId, role: 'owner', joinedAt: new Date() },
        ...memberIds
          .filter(id => id !== ownerId)
          .map(userId => ({ userId, role: 'member', joinedAt: new Date() })),
      ],
    });
    console.log(`Created project: ${projectName}`);
  } else {
    const existingMembers = (project.members ?? []).map((member: any) => member.userId.toString());
    const missingMemberIds = memberIds.filter(id => !existingMembers.includes(id));

    if (missingMemberIds.length > 0) {
      project = await Project.findByIdAndUpdate(
        project._id,
        {
          $addToSet: {
            members: {
              $each: missingMemberIds.map(userId => ({
                userId,
                role: 'member',
                joinedAt: new Date(),
              })),
            },
          },
        },
        { new: true }
      );
      console.log(`Updated project members for: ${projectName}`);
    } else {
      console.log(`Project already exists, reused: ${projectName}`);
    }
  }

  return project;
}

async function ensureTask(
  projectId: string,
  title: string,
  description: string,
  assigneeId: string,
  dueDate: Date,
  status: string,
  priority: string
) {
  const existing = await Task.findOne({ projectId, title }).lean();

  if (!existing) {
    await Task.create({
      projectId,
      title,
      description,
      assigneeId,
      dueDate,
      status,
      priority,
      tags: ['temp', 'frontend-test'],
    });
    console.log(`Created task: ${title}`);
  } else {
    console.log(`Task already exists, reused: ${title}`);
  }
}

async function main() {
  const database = Database.getInstance();
  await database.connect();

  const usersByEmail = await ensureUsers();

  const priya = usersByEmail.get('pdiya3827@gmail.com');
  const emma = usersByEmail.get('emma@example.com');

  if (!priya || !emma) {
    throw new Error('Required temporary users could not be resolved.');
  }

  const sharedProject = await ensureProject('Temp Shared Sprint', priya._id.toString(), [
    priya._id.toString(),
    emma._id.toString(),
  ]);
  const emmaProject = await ensureProject('Emma Delivery Board', emma._id.toString(), [
    emma._id.toString(),
    priya._id.toString(),
  ]);
  const priyaProject = await ensureProject('Priya Ops Backlog', priya._id.toString(), [
    priya._id.toString(),
    emma._id.toString(),
  ]);

  const taskSet = [
    {
      projectId: sharedProject._id.toString(),
      title: 'Shared sprint kickoff',
      description: 'Kick off the shared sprint and confirm goals for both team members.',
      assigneeId: priya._id.toString(),
      dueDate: new Date('2026-08-30'),
      status: 'todo',
      priority: 'high',
    },
    {
      projectId: sharedProject._id.toString(),
      title: 'QA regression review',
      description: 'Review the shared backlog and sign off the QA checklist.',
      assigneeId: emma._id.toString(),
      dueDate: new Date('2026-09-02'),
      status: 'in_progress',
      priority: 'medium',
    },
    {
      projectId: sharedProject._id.toString(),
      title: 'Client summary update',
      description: 'Prepare the status summary for the shareable delivery status update.',
      assigneeId: priya._id.toString(),
      dueDate: new Date('2026-08-24'),
      status: 'done',
      priority: 'low',
    },
    {
      projectId: emmaProject._id.toString(),
      title: 'Delivery checklist review',
      description: 'Review the delivery checklist and confirm blockers before handoff.',
      assigneeId: emma._id.toString(),
      dueDate: new Date('2026-09-05'),
      status: 'todo',
      priority: 'high',
    },
    {
      projectId: emmaProject._id.toString(),
      title: 'Asset export prep',
      description: 'Prepare and export the latest assets for the team review.',
      assigneeId: priya._id.toString(),
      dueDate: new Date('2026-09-07'),
      status: 'in_progress',
      priority: 'medium',
    },
    {
      projectId: priyaProject._id.toString(),
      title: 'Release notes polish',
      description: 'Polish the release notes and align final signoff items.',
      assigneeId: emma._id.toString(),
      dueDate: new Date('2026-09-09'),
      status: 'done',
      priority: 'low',
    },
    {
      projectId: priyaProject._id.toString(),
      title: 'Ops follow-up triage',
      description: 'Triage pending follow-ups and create the next wave of fixes.',
      assigneeId: priya._id.toString(),
      dueDate: new Date('2026-09-11'),
      status: 'todo',
      priority: 'high',
    },
  ];

  for (const task of taskSet) {
    await ensureTask(
      task.projectId,
      task.title,
      task.description,
      task.assigneeId,
      task.dueDate,
      task.status,
      task.priority
    );
  }

  console.log('\n=== TEMPORARY DATA SUMMARY ===');
  for (const project of [sharedProject, emmaProject, priyaProject]) {
    const populatedProject: any = await Project.findById(project._id)
      .populate('ownerId', 'name email')
      .populate('members.userId', 'name email')
      .lean();
    const tasksForProject = await Task.find({ projectId: project._id })
      .populate('assigneeId', 'name email')
      .lean();

    console.log(
      JSON.stringify(
        {
          project: populatedProject?.name,
          owner: populatedProject?.ownerId?.email,
          members: populatedProject?.members?.map((member: any) => ({
            name: member.userId?.name,
            email: member.userId?.email,
            role: member.role,
          })),
          tasks: tasksForProject.map((task: any) => ({
            title: task.title,
            assignee: task.assigneeId?.email,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
          })),
        },
        null,
        2
      )
    );
  }

  await database.disconnect();
}

void main().catch(error => {
  console.error('Temp data generation failed:', error);
  process.exit(1);
});
