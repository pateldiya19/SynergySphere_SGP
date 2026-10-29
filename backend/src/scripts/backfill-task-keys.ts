/**
 * Give every task a TASK-n key, and build the uniqueness index that enforces it.
 *
 *   npm run backfill:task-keys
 *
 * Why this is needed: task keys are how a commit or pull request finds its
 * task. A commit message saying "TASK-7: fix the thing" only links if some task
 * actually carries TASK-7. Tasks created before keys existed have none, so no
 * GitHub evidence can ever reach them.
 *
 * The matching unique index on (projectId, taskKey) also never got built: with
 * many tasks sharing a null key it could not be created, and Mongoose reports
 * that failure in the background without raising it. Two tasks in one project
 * could therefore end up with the same key, which routes a commit's evidence to
 * whichever one the query happened to return first.
 *
 * Safe to run repeatedly: tasks that already have a key keep it, and the
 * per-project counter continues above the highest key already in use.
 */
import Database from '@/config/database';
import { Project, Task } from '@/models';

type ProjectSummary = {
  name: string;
  assigned: number;
  firstKey?: string;
  lastKey?: string;
};

async function backfillProject(project: any): Promise<ProjectSummary> {
  const tasks = await Task.find({ projectId: project._id })
    .select('taskKey createdAt')
    .sort({ createdAt: 1 })
    .lean<Array<{ _id: unknown; taskKey?: string }>>();

  // Continue above whatever is already in use, so existing keys never move --
  // they may already be referenced from commit messages and pull requests.
  let highest = 0;
  for (const task of tasks) {
    const parsed = Number(String(task.taskKey || '').replace('TASK-', ''));
    if (Number.isFinite(parsed)) highest = Math.max(highest, parsed);
  }

  const summary: ProjectSummary = { name: project.name, assigned: 0 };

  // Oldest first, so key order matches the order the work was created in.
  for (const task of tasks) {
    if (task.taskKey) continue;
    highest += 1;
    const key = `TASK-${highest}`;
    await Task.updateOne({ _id: task._id }, { $set: { taskKey: key } }, { timestamps: false });
    summary.assigned += 1;
    summary.firstKey = summary.firstKey || key;
    summary.lastKey = key;
  }

  // Keep the allocator in step so the next task created through the API does
  // not hand out a key this backfill just used.
  if (highest > (project.taskSequence || 0)) {
    await Project.updateOne(
      { _id: project._id },
      { $set: { taskSequence: highest } },
      { timestamps: false }
    );
  }

  return summary;
}

async function ensureUniqueIndex(): Promise<void> {
  const indexes = await Task.collection.indexes();
  const existing = indexes.find(index => index.name === 'projectId_1_taskKey_1');

  if (existing) {
    console.log('  index projectId_1_taskKey_1 already present');
    return;
  }

  try {
    // Partial rather than plain unique: a task that somehow lacks a key should
    // not collide with every other keyless task in its project.
    await Task.collection.createIndex(
      { projectId: 1, taskKey: 1 },
      {
        unique: true,
        partialFilterExpression: { taskKey: { $type: 'string' } },
        name: 'projectId_1_taskKey_1',
      }
    );
    console.log('  index projectId_1_taskKey_1 created (unique, partial on string keys)');
  } catch (error: any) {
    console.log(`  index could not be created: ${error.message}`);
    console.log('  (resolve the duplicate keys it names, then run this script again)');
  }
}

async function main() {
  const database = Database.getInstance();
  await database.connect();

  const before = await Task.countDocuments({
    $or: [{ taskKey: { $exists: false } }, { taskKey: null }, { taskKey: '' }],
  });
  const total = await Task.countDocuments({});
  console.log(`\nTasks without a key: ${before} of ${total}\n`);

  const projects = await Project.find({}).lean<any[]>();
  let assigned = 0;

  for (const project of projects) {
    const summary = await backfillProject(project);
    if (summary.assigned === 0) continue;
    assigned += summary.assigned;
    console.log(
      `  ${summary.name}: assigned ${summary.assigned} (${summary.firstKey}..${summary.lastKey})`
    );
  }

  console.log(`\nAssigned ${assigned} task keys.`);

  console.log('\nIndex');
  await ensureUniqueIndex();

  const after = await Task.countDocuments({
    $or: [{ taskKey: { $exists: false } }, { taskKey: null }, { taskKey: '' }],
  });
  console.log(`\nTasks without a key now: ${after} of ${total}`);

  await database.disconnect();
}

void main().catch(error => {
  console.error('Task key backfill failed:', error);
  process.exit(1);
});
