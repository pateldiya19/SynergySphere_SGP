import {
  listProjectPresence,
  isSocketTrackingProject,
  projectRoom,
  removeProjectPresence,
  taskRoom,
  trackProjectPresence,
  untrackSocketProject,
  untrackSocketPresence,
  userRoom,
} from '../src/infrastructure/socket';

describe('Socket realtime registry', () => {
  it('builds isolated project, task, and user rooms', () => {
    expect(projectRoom('project-1')).toBe('project-project-1');
    expect(taskRoom('task-1')).toBe('task-task-1');
    expect(userRoom('user-1')).toBe('user-user-1');
  });

  it('tracks presence across multiple sockets and only emits offline after the last socket leaves', () => {
    const user = { id: 'presence-user', name: 'Presence User' };
    expect(trackProjectPresence('socket-1', 'presence-project', user)).toBe(true);
    expect(trackProjectPresence('socket-2', 'presence-project', user)).toBe(false);
    expect(listProjectPresence('presence-project')).toHaveLength(1);

    expect(removeProjectPresence('presence-project', user.id)?.offline).toBe(false);
    untrackSocketPresence('socket-1');
    expect(removeProjectPresence('presence-project', user.id)?.offline).toBe(true);
    untrackSocketPresence('socket-2');
    expect(listProjectPresence('presence-project')).toHaveLength(0);
  });

  it('does not count duplicate joins from one socket more than once', () => {
    const user = { id: 'duplicate-user', name: 'Duplicate User' };
    expect(trackProjectPresence('duplicate-socket', 'duplicate-project', user)).toBe(true);
    expect(trackProjectPresence('duplicate-socket', 'duplicate-project', user)).toBe(false);
    expect(isSocketTrackingProject('duplicate-socket', 'duplicate-project')).toBe(true);
    expect(listProjectPresence('duplicate-project')).toHaveLength(1);

    expect(untrackSocketProject('duplicate-socket', 'duplicate-project')).toBe(true);
    expect(untrackSocketProject('duplicate-socket', 'duplicate-project')).toBe(false);
    expect(removeProjectPresence('duplicate-project', user.id)?.offline).toBe(true);
    expect(listProjectPresence('duplicate-project')).toHaveLength(0);
  });
});
