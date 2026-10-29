/**
 * Additive historical seed for SynergySphere.
 *
 * Adds realistic "already running for a while" data: three users, three
 * projects with cross-membership, a backlog of completed/pending tasks, and
 * project discussions whose messages are spread across previous days/weeks.
 *
 * Safety:
 *  - It NEVER deletes or clears anything.
 *  - It is idempotent: re-running reuses existing users/projects/tasks/threads
 *    (matched by email, project name + owner, task title + project, etc.)
 *    instead of duplicating them.
 *  - Existing users matched by email are reused as-is; their password is not
 *    changed.
 *
 * Run with:  npm run seed:history
 */
import mongoose from 'mongoose';
import Database from '@/config/database';
import { Notification, Project, Reply, Task, Thread, User } from '@/models';

const SEED_TAG = 'seed:history';
const SEED_PASSWORD = 'Password123';

const NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

/** A date `days` in the past (negative = future), at the given hour. */
function daysAgo(days: number, hour = 10, minute = 0): Date {
  const date = new Date(NOW.getTime() - days * DAY_MS);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** Create a document with explicit createdAt/updatedAt so history looks real. */
async function createBackdated<T>(
  model: any,
  data: any,
  createdAt: Date,
  updatedAt?: Date
): Promise<T> {
  const document = new model(data);
  document.createdAt = createdAt;
  document.updatedAt = updatedAt ?? createdAt;
  await document.save({ timestamps: false });
  return document as T;
}

const summary = {
  usersCreated: 0,
  usersReused: 0,
  projectsCreated: 0,
  projectsReused: 0,
  tasksCreated: 0,
  tasksReused: 0,
  threadsCreated: 0,
  threadsReused: 0,
  messagesCreated: 0,
  messagesReused: 0,
  notificationsCreated: 0,
};

// ---------------------------------------------------------------------------
// Seed definitions
// ---------------------------------------------------------------------------

const USERS = [
  { key: 'aarav', name: 'Aarav Sharma', email: 'aarav@synergysphere.dev' },
  { key: 'neha', name: 'Neha Verma', email: 'neha@synergysphere.dev' },
  { key: 'rohan', name: 'Rohan Mehta', email: 'rohan@synergysphere.dev' },
];

const PROJECTS = [
  {
    key: 'website',
    name: 'Website Revamp 2026',
    description:
      'Rebuild the marketing site with a new design system, faster pages, and a refreshed content structure.',
    ownerKey: 'aarav',
    memberKeys: ['neha', 'rohan'],
    tags: ['web', 'design', 'marketing'],
    createdDaysAgo: 74,
    updatedDaysAgo: 5,
    deadlineDaysAgo: -21, // three weeks out
  },
  {
    key: 'mobile',
    name: 'Mobile App Launch',
    description:
      'Ship the first public release of the SynergySphere mobile app on Android and iOS.',
    ownerKey: 'neha',
    memberKeys: ['aarav', 'rohan'],
    tags: ['mobile', 'release'],
    createdDaysAgo: 52,
    updatedDaysAgo: 2,
    deadlineDaysAgo: -35,
  },
  {
    key: 'support',
    name: 'Customer Support Portal',
    description:
      'Self-service help centre with ticket tracking, canned responses, and an internal knowledge base.',
    ownerKey: 'rohan',
    memberKeys: ['aarav', 'neha'],
    tags: ['support', 'internal'],
    createdDaysAgo: 30,
    updatedDaysAgo: 3,
    deadlineDaysAgo: -49,
  },
];

const TASKS = [
  // Website Revamp 2026 — mature project, most work done
  {
    projectKey: 'website',
    title: 'Audit current site performance',
    description: 'Run Lighthouse across key pages and record baseline scores.',
    assigneeKey: 'rohan',
    status: 'done',
    priority: 'high',
    createdDaysAgo: 72,
    dueDaysAgo: 66,
    tags: ['performance', 'research'],
  },
  {
    projectKey: 'website',
    title: 'Define new design tokens',
    description: 'Agree on colour, spacing, and typography scales for the refreshed brand.',
    assigneeKey: 'neha',
    status: 'done',
    priority: 'medium',
    createdDaysAgo: 68,
    dueDaysAgo: 58,
    tags: ['design', 'design-system'],
  },
  {
    projectKey: 'website',
    title: 'Rebuild homepage hero section',
    description: 'Implement the new hero with responsive breakpoints and reduced layout shift.',
    assigneeKey: 'aarav',
    status: 'done',
    priority: 'high',
    createdDaysAgo: 55,
    dueDaysAgo: 44,
    tags: ['frontend', 'design'],
  },
  {
    projectKey: 'website',
    title: 'Migrate blog content to CMS',
    description: 'Move 40+ posts across, preserving slugs and redirects.',
    assigneeKey: 'rohan',
    status: 'in_progress',
    priority: 'medium',
    createdDaysAgo: 34,
    dueDaysAgo: -6,
    tags: ['content', 'migration'],
  },
  {
    projectKey: 'website',
    title: 'Fix broken pricing page links',
    description: 'Several outbound links 404 after the URL restructure.',
    assigneeKey: 'neha',
    status: 'in_progress',
    priority: 'high',
    createdDaysAgo: 19,
    dueDaysAgo: 2,
    tags: ['bug', 'content'],
  },
  {
    projectKey: 'website',
    title: 'Accessibility pass on forms',
    description: 'Labels, focus order, and contrast on every form in the funnel.',
    assigneeKey: 'aarav',
    status: 'todo',
    priority: 'medium',
    createdDaysAgo: 11,
    dueDaysAgo: -12,
    tags: ['a11y', 'frontend'],
  },
  {
    projectKey: 'website',
    title: 'Write launch announcement post',
    description: 'Draft the announcement and send for review before go-live.',
    assigneeKey: 'neha',
    status: 'todo',
    priority: 'low',
    createdDaysAgo: 6,
    dueDaysAgo: -20,
    tags: ['content', 'launch'],
  },

  // Mobile App Launch — mid-flight
  {
    projectKey: 'mobile',
    title: 'Set up CI pipeline for builds',
    description: 'Automated builds and signing for both stores on every merge to main.',
    assigneeKey: 'aarav',
    status: 'done',
    priority: 'high',
    createdDaysAgo: 50,
    dueDaysAgo: 41,
    tags: ['devops', 'ci'],
  },
  {
    projectKey: 'mobile',
    title: 'Implement offline task caching',
    description: 'Queue task edits locally and sync once the device is back online.',
    assigneeKey: 'rohan',
    status: 'done',
    priority: 'high',
    createdDaysAgo: 44,
    dueDaysAgo: 30,
    tags: ['mobile', 'sync'],
  },
  {
    projectKey: 'mobile',
    title: 'Push notification permissions flow',
    description: 'Ask for permission in context instead of on first launch.',
    assigneeKey: 'neha',
    status: 'in_progress',
    priority: 'medium',
    createdDaysAgo: 26,
    dueDaysAgo: -3,
    tags: ['mobile', 'ux'],
  },
  {
    projectKey: 'mobile',
    title: 'Crash on rotate in task detail',
    description: 'Reported by two beta testers on Android 14 tablets.',
    assigneeKey: 'rohan',
    status: 'in_progress',
    priority: 'high',
    createdDaysAgo: 14,
    dueDaysAgo: 1,
    tags: ['bug', 'android'],
  },
  {
    projectKey: 'mobile',
    title: 'Prepare store listing assets',
    description: 'Screenshots, feature graphic, and description copy for both stores.',
    assigneeKey: 'neha',
    status: 'todo',
    priority: 'medium',
    createdDaysAgo: 9,
    dueDaysAgo: -14,
    tags: ['launch', 'design'],
  },
  {
    projectKey: 'mobile',
    title: 'Beta feedback triage',
    description: 'Group the beta feedback into bugs, papercuts, and feature requests.',
    assigneeKey: 'aarav',
    status: 'todo',
    priority: 'low',
    createdDaysAgo: 4,
    dueDaysAgo: -25,
    tags: ['research', 'triage'],
  },

  // Customer Support Portal — newest project
  {
    projectKey: 'support',
    title: 'Map the current ticket workflow',
    description: 'Document every stage a ticket passes through today.',
    assigneeKey: 'neha',
    status: 'done',
    priority: 'medium',
    createdDaysAgo: 28,
    dueDaysAgo: 21,
    tags: ['research', 'process'],
  },
  {
    projectKey: 'support',
    title: 'Draft knowledge base structure',
    description: 'Top-level categories and the first ten articles to write.',
    assigneeKey: 'rohan',
    status: 'in_progress',
    priority: 'medium',
    createdDaysAgo: 18,
    dueDaysAgo: -4,
    tags: ['content', 'planning'],
  },
  {
    projectKey: 'support',
    title: 'Build ticket status timeline',
    description: 'Show a chronological history of status changes on each ticket.',
    assigneeKey: 'aarav',
    status: 'todo',
    priority: 'high',
    createdDaysAgo: 8,
    dueDaysAgo: -9,
    tags: ['frontend', 'feature'],
  },
  {
    projectKey: 'support',
    title: 'Canned response templates',
    description: 'Write the ten most common replies with placeholders.',
    assigneeKey: 'neha',
    status: 'todo',
    priority: 'low',
    createdDaysAgo: 3,
    dueDaysAgo: -18,
    tags: ['content', 'support'],
  },
];

type MessageSeed = {
  authorKey: string;
  body: string;
  daysAgo: number;
  hour: number;
  minute?: number;
};

const THREADS: {
  projectKey: string;
  title: string;
  authorKey: string;
  createdDaysAgo: number;
  createdHour: number;
  messages: MessageSeed[];
}[] = [
  {
    projectKey: 'website',
    title: 'Kickoff: scope and milestones',
    authorKey: 'aarav',
    createdDaysAgo: 73,
    createdHour: 9,
    messages: [
      {
        authorKey: 'aarav',
        body: 'Kicking this off. Scope for phase one is the marketing site only — app screens stay untouched until we ship this.',
        daysAgo: 73,
        hour: 9,
        minute: 15,
      },
      {
        authorKey: 'neha',
        body: 'Works for me. I will have the design tokens ready before we touch any component code.',
        daysAgo: 73,
        hour: 11,
        minute: 40,
      },
      {
        authorKey: 'rohan',
        body: 'Baseline Lighthouse numbers are in: homepage 48 on mobile, pricing 51. Plenty of room to improve.',
        daysAgo: 71,
        hour: 15,
        minute: 5,
      },
      {
        authorKey: 'aarav',
        body: 'That is worse than I expected. Let us make performance an acceptance criterion, not a nice-to-have.',
        daysAgo: 70,
        hour: 10,
        minute: 20,
      },
      {
        authorKey: 'neha',
        body: 'Agreed. Target: 90+ on mobile for the homepage before launch.',
        daysAgo: 70,
        hour: 10,
        minute: 55,
      },
    ],
  },
  {
    projectKey: 'website',
    title: 'Blog migration blockers',
    authorKey: 'rohan',
    createdDaysAgo: 21,
    createdHour: 14,
    messages: [
      {
        authorKey: 'rohan',
        body: 'Migration is about 60% through. The older posts have inline HTML that the importer chokes on.',
        daysAgo: 21,
        hour: 14,
        minute: 10,
      },
      {
        authorKey: 'aarav',
        body: 'How many are affected? If it is under twenty we can just clean them by hand.',
        daysAgo: 21,
        hour: 16,
        minute: 30,
      },
      {
        authorKey: 'rohan',
        body: 'Fourteen. I will clean them manually and keep the importer for the rest.',
        daysAgo: 20,
        hour: 9,
        minute: 45,
      },
      {
        authorKey: 'neha',
        body: 'Please keep the old slugs — I already queued redirects based on them.',
        daysAgo: 20,
        hour: 12,
        minute: 0,
      },
      {
        authorKey: 'rohan',
        body: 'Slugs are preserved. I will post here again once the last batch is across.',
        daysAgo: 12,
        hour: 17,
        minute: 25,
      },
      {
        authorKey: 'aarav',
        body: 'Thanks. Once that lands we can start the accessibility pass.',
        daysAgo: 5,
        hour: 11,
        minute: 10,
      },
    ],
  },
  {
    projectKey: 'mobile',
    title: 'Release checklist for v1.0',
    authorKey: 'neha',
    createdDaysAgo: 33,
    createdHour: 10,
    messages: [
      {
        authorKey: 'neha',
        body: 'Starting the release checklist. Blockers so far: offline sync, the rotate crash, and store assets.',
        daysAgo: 33,
        hour: 10,
        minute: 5,
      },
      {
        authorKey: 'rohan',
        body: 'Offline sync is done and merged. Conflicts resolve last-write-wins for now, which is fine for v1.',
        daysAgo: 29,
        hour: 13,
        minute: 15,
      },
      {
        authorKey: 'aarav',
        body: 'CI is signing both builds automatically now, so we can cut a release candidate any time.',
        daysAgo: 27,
        hour: 9,
        minute: 30,
      },
      {
        authorKey: 'neha',
        body: 'Great. That leaves the crash and the listing assets. I will take the assets.',
        daysAgo: 26,
        hour: 15,
        minute: 45,
      },
      {
        authorKey: 'rohan',
        body: 'Reproduced the crash — it only happens on tablets when the detail sheet is open during rotation.',
        daysAgo: 13,
        hour: 11,
        minute: 20,
      },
      {
        authorKey: 'aarav',
        body: 'Sounds like the sheet is not saving its state. Ping me if you want a second pair of eyes.',
        daysAgo: 13,
        hour: 12,
        minute: 5,
      },
    ],
  },
  {
    projectKey: 'mobile',
    title: 'Beta feedback themes',
    authorKey: 'aarav',
    createdDaysAgo: 8,
    createdHour: 16,
    messages: [
      {
        authorKey: 'aarav',
        body: 'First pass through the beta feedback. Three themes: notification noise, slow first load, and no dark mode.',
        daysAgo: 8,
        hour: 16,
        minute: 10,
      },
      {
        authorKey: 'neha',
        body: 'Notification noise we can fix by asking for permission in context instead of on launch. Already in progress.',
        daysAgo: 7,
        hour: 10,
        minute: 0,
      },
      {
        authorKey: 'rohan',
        body: 'Dark mode is a bigger lift. I would push it to 1.1 rather than hold the release.',
        daysAgo: 6,
        hour: 14,
        minute: 35,
      },
      {
        authorKey: 'aarav',
        body: 'Agreed, 1.1 for dark mode. Slow first load I will look at this week.',
        daysAgo: 2,
        hour: 9,
        minute: 50,
      },
    ],
  },
  {
    projectKey: 'support',
    title: 'What goes in the knowledge base first?',
    authorKey: 'rohan',
    createdDaysAgo: 17,
    createdHour: 11,
    messages: [
      {
        authorKey: 'rohan',
        body: 'Proposing we start with the ten questions support answers most often, rather than a full taxonomy.',
        daysAgo: 17,
        hour: 11,
        minute: 5,
      },
      {
        authorKey: 'neha',
        body: 'Yes. I pulled last quarter’s tickets — billing and password reset are nearly half of everything.',
        daysAgo: 16,
        hour: 13,
        minute: 25,
      },
      {
        authorKey: 'aarav',
        body: 'Then those two categories should be on the landing page, not buried behind a search box.',
        daysAgo: 16,
        hour: 15,
        minute: 40,
      },
      {
        authorKey: 'rohan',
        body: 'Noted. I will restructure the draft so billing and account access are surfaced first.',
        daysAgo: 9,
        hour: 10,
        minute: 15,
      },
      {
        authorKey: 'neha',
        body: 'Once the structure is settled I can start writing the canned responses to match.',
        daysAgo: 3,
        hour: 16,
        minute: 20,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seeding steps
// ---------------------------------------------------------------------------

async function seedUsers(): Promise<Map<string, any>> {
  const byKey = new Map<string, any>();

  for (const seed of USERS) {
    const email = seed.email.toLowerCase();
    let user: any = await User.findOne({ email });

    if (user) {
      summary.usersReused += 1;
      console.log(`  reused user   ${email}`);
    } else {
      user = await User.create({ name: seed.name, email, password: SEED_PASSWORD, avatarUrl: '' });
      summary.usersCreated += 1;
      console.log(`  created user  ${email}`);
    }

    byKey.set(seed.key, user);
  }

  return byKey;
}

async function seedProjects(usersByKey: Map<string, any>): Promise<Map<string, any>> {
  const byKey = new Map<string, any>();

  for (const seed of PROJECTS) {
    const owner = usersByKey.get(seed.ownerKey);
    const createdAt = daysAgo(seed.createdDaysAgo, 9);

    let project: any = await Project.findOne({ name: seed.name, ownerId: owner._id });

    if (project) {
      // Only top up missing members; never rewrite what is already there.
      const existingMemberIds = new Set(
        (project.members || []).map((member: any) => String(member.userId))
      );
      let changed = false;

      let membersAdded = 0;
      for (const memberKey of seed.memberKeys) {
        const member = usersByKey.get(memberKey);
        if (!existingMemberIds.has(String(member._id))) {
          project.members.push({ userId: member._id, role: 'member', joinedAt: createdAt });
          membersAdded += 1;
          changed = true;
        }
      }

      // Rows written by an earlier revision of this script carried a visible
      // "seed:history" tag and a nonsense updatedAt; tidy those up in place.
      if ((project.tags || []).includes(SEED_TAG)) {
        project.tags = project.tags.filter((tag: string) => tag !== SEED_TAG);
        project.updatedAt = daysAgo(seed.updatedDaysAgo, 17);
        changed = true;
      }

      if (changed) await project.save({ timestamps: false });
      summary.projectsReused += 1;
      console.log(
        `  reused project  ${seed.name}${membersAdded ? ` (added ${membersAdded} missing member(s))` : ''}`
      );
    } else {
      project = await createBackdated(
        Project,
        {
          name: seed.name,
          description: seed.description,
          ownerId: owner._id,
          tags: [...seed.tags],
          deadline: daysAgo(seed.deadlineDaysAgo, 18),
          isActive: true,
          members: [
            { userId: owner._id, role: 'owner', joinedAt: createdAt },
            ...seed.memberKeys.map((memberKey, index) => ({
              userId: usersByKey.get(memberKey)._id,
              role: 'member' as const,
              joinedAt: daysAgo(seed.createdDaysAgo - (index + 1), 11),
            })),
          ],
        },
        createdAt,
        daysAgo(seed.updatedDaysAgo, 17)
      );
      summary.projectsCreated += 1;
      console.log(`  created project ${seed.name}`);
    }

    byKey.set(seed.key, project);
  }

  return byKey;
}

async function seedTasks(
  usersByKey: Map<string, any>,
  projectsByKey: Map<string, any>
): Promise<void> {
  for (const seed of TASKS) {
    const project = projectsByKey.get(seed.projectKey);
    const existing = await Task.findOne({ projectId: project._id, title: seed.title });

    if (existing) {
      // Replace the placeholder tag written by an earlier revision.
      if ((existing.tags || []).includes(SEED_TAG)) {
        await Task.updateOne(
          { _id: existing._id },
          { $set: { tags: seed.tags } },
          { timestamps: false }
        );
      }
      summary.tasksReused += 1;
      continue;
    }

    const createdAt = daysAgo(seed.createdDaysAgo, 10);
    // Completed work was last touched around its due date; open work more recently.
    const updatedAt =
      seed.status === 'done'
        ? daysAgo(Math.max(seed.dueDaysAgo, 0), 16)
        : daysAgo(Math.min(seed.createdDaysAgo, 4), 15);

    await createBackdated(
      Task,
      {
        projectId: project._id,
        title: seed.title,
        description: seed.description,
        assigneeId: usersByKey.get(seed.assigneeKey)._id,
        dueDate: daysAgo(seed.dueDaysAgo, 18),
        status: seed.status,
        priority: seed.priority,
        tags: seed.tags,
      },
      createdAt,
      updatedAt
    );
    summary.tasksCreated += 1;
  }

  console.log(`  tasks: ${summary.tasksCreated} created, ${summary.tasksReused} already present`);
}

async function seedDiscussions(
  usersByKey: Map<string, any>,
  projectsByKey: Map<string, any>
): Promise<void> {
  const activity: {
    userIds: string[];
    type: 'thread_new' | 'reply_new';
    title: string;
    message: string;
    payload: any;
    createdAt: Date;
  }[] = [];

  for (const seed of THREADS) {
    const project = projectsByKey.get(seed.projectKey);
    const author = usersByKey.get(seed.authorKey);
    const threadCreatedAt = daysAgo(seed.createdDaysAgo, seed.createdHour);
    const lastMessage = seed.messages[seed.messages.length - 1];
    const lastReplyAt = daysAgo(lastMessage.daysAgo, lastMessage.hour, lastMessage.minute ?? 0);

    let thread: any = await Thread.findOne({ projectId: project._id, title: seed.title });

    if (thread) {
      if ((thread.tags || []).includes(SEED_TAG)) {
        await Thread.updateOne({ _id: thread._id }, { $set: { tags: [] } }, { timestamps: false });
      }
      summary.threadsReused += 1;
    } else {
      thread = await createBackdated(
        Thread,
        {
          projectId: project._id,
          title: seed.title,
          authorId: author._id,
          replyCount: seed.messages.length,
          lastReplyAt,
          tags: [],
        },
        threadCreatedAt,
        lastReplyAt
      );
      summary.threadsCreated += 1;

      activity.push({
        userIds: (project.members || [])
          .map((member: any) => String(member.userId))
          .filter((id: string) => id !== String(author._id)),
        type: 'thread_new',
        title: 'New discussion started',
        message: `${author.name} started "${seed.title}" in ${project.name}`,
        payload: { projectId: String(project._id), threadId: String(thread._id) },
        createdAt: threadCreatedAt,
      });
    }

    let created = 0;
    for (const messageSeed of seed.messages) {
      const messageAuthor = usersByKey.get(messageSeed.authorKey);
      const alreadyThere = await Reply.findOne({
        threadId: thread._id,
        authorId: messageAuthor._id,
        body: messageSeed.body,
      });

      if (alreadyThere) {
        summary.messagesReused += 1;
        continue;
      }

      const sentAt = daysAgo(messageSeed.daysAgo, messageSeed.hour, messageSeed.minute ?? 0);
      await createBackdated(
        Reply,
        {
          threadId: thread._id,
          authorId: messageAuthor._id,
          body: messageSeed.body,
        },
        sentAt
      );
      summary.messagesCreated += 1;
      created += 1;

      // Recent replies also leave a notification trail (older ones are pruned
      // by the Notification TTL index, so we only record the last two weeks).
      if (messageSeed.daysAgo <= 14) {
        activity.push({
          userIds: (project.members || [])
            .map((member: any) => String(member.userId))
            .filter((id: string) => id !== String(messageAuthor._id)),
          type: 'reply_new',
          title: 'New message in a discussion',
          message: `${messageAuthor.name} replied to "${seed.title}"`,
          payload: { projectId: String(project._id), threadId: String(thread._id) },
          createdAt: sentAt,
        });
      }
    }

    // Keep the denormalised counters honest if messages were added.
    if (created > 0) {
      const replyCount = await Reply.countDocuments({ threadId: thread._id });
      await Thread.updateOne(
        { _id: thread._id },
        { $set: { replyCount, lastReplyAt } },
        { timestamps: false }
      );
    }

    console.log(`  discussion "${seed.title}" — ${created} message(s) added`);
  }

  for (const entry of activity) {
    for (const userId of entry.userIds) {
      await createBackdated(
        Notification,
        {
          userId,
          type: entry.type,
          title: entry.title,
          message: entry.message,
          payload: entry.payload,
          read: true,
        },
        entry.createdAt
      );
      summary.notificationsCreated += 1;
    }
  }
}

async function main(): Promise<void> {
  const database = Database.getInstance();
  await database.connect();

  // Always state the target up front. MONGODB_URI decides whether this writes
  // to a local mongod or to Atlas, and seeding one while the backend reads the
  // other is the easiest mistake to make here.
  const target = `host=${mongoose.connection.host} database=${mongoose.connection.name}`;
  console.log(`\nSeeding historical data into: ${target}`);
  console.log('(additive — nothing is deleted)\n');

  console.log('Users');
  const usersByKey = await seedUsers();

  console.log('\nProjects');
  const projectsByKey = await seedProjects(usersByKey);

  console.log('\nTasks');
  await seedTasks(usersByKey, projectsByKey);

  console.log('\nDiscussions');
  await seedDiscussions(usersByKey, projectsByKey);

  console.log(`\n=== Summary (written to ${target}) ===`);
  console.log(`  users:         ${summary.usersCreated} created, ${summary.usersReused} reused`);
  console.log(
    `  projects:      ${summary.projectsCreated} created, ${summary.projectsReused} reused`
  );
  console.log(`  tasks:         ${summary.tasksCreated} created, ${summary.tasksReused} reused`);
  console.log(
    `  threads:       ${summary.threadsCreated} created, ${summary.threadsReused} reused`
  );
  console.log(
    `  messages:      ${summary.messagesCreated} created, ${summary.messagesReused} reused`
  );
  console.log(`  notifications: ${summary.notificationsCreated} created`);

  console.log('\n=== Login credentials for seeded users ===');
  for (const seed of USERS) {
    console.log(`  ${seed.name.padEnd(14)} ${seed.email.padEnd(28)} ${SEED_PASSWORD}`);
  }
  console.log('  (existing accounts matched by email keep their original password)\n');

  await database.disconnect();
  process.exit(0);
}

void main().catch(error => {
  console.error('Historical seed failed:', error);
  process.exit(1);
});
