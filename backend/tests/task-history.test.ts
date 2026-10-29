import mongoose from 'mongoose';
import { TaskHistory } from '../src/app/models/TaskHistory';

describe('TaskHistory persistence', () => {
  it('stores a task activity with source, changes, and metadata', async () => {
    const taskId = new mongoose.Types.ObjectId();
    const projectId = new mongoose.Types.ObjectId();
    const history = await TaskHistory.create({
      taskId,
      projectId,
      type: 'STATUS_CHANGED',
      source: 'user',
      description: 'Status changed from todo to in_progress',
      changes: { status: { before: 'todo', after: 'in_progress' } },
      metadata: { requestId: 'test-request' },
    });

    expect(history.taskId?.toString()).toBe(taskId.toString());
    expect(history.projectId.toString()).toBe(projectId.toString());
    expect(history.type).toBe('STATUS_CHANGED');
    expect(history.source).toBe('user');
    expect(history.changes).toEqual({ status: { before: 'todo', after: 'in_progress' } });
    expect(history.createdAt).toBeInstanceOf(Date);
  });
});
