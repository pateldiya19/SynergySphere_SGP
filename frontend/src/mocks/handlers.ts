import { rest } from 'msw'

// Mock data
const users = [
  { id: '1', name: 'Alex Rivera', email: 'user@example.com', avatarUrl: '' },
  { id: '2', name: 'Sarah Chen', email: 'sarah@example.com', avatarUrl: '' },
  { id: '3', name: 'Mike Johnson', email: 'mike@example.com', avatarUrl: '' },
  { id: '4', name: 'Emma Davis', email: 'emma@example.com', avatarUrl: '' },
]

const projects = [
  {
    id: '1',
    name: 'Website Redesign',
    description: 'Complete overhaul of the company website with modern design',
    ownerId: '1',
    members: [
      { userId: '1', role: 'owner' },
      { userId: '2', role: 'member' },
      { userId: '3', role: 'member' },
    ],
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T15:30:00Z',
  },
]

const tasks = [
  {
    id: '1',
    projectId: '1',
    title: 'Design homepage mockup',
    description: 'Create wireframes and high-fidelity mockups for the new homepage',
    assigneeId: '2',
    dueDate: '2024-01-25T00:00:00Z',
    status: 'done',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T14:30:00Z',
  },
]

export const handlers = [
  // Auth endpoints
  rest.post('/api/auth/login', (req, res, ctx) => {
    const { email, password } = req.body as any

    if (email === 'user@example.com' && password === 'password123') {
      return res(
        ctx.delay(500),
        ctx.json({
          user: users[0],
          token: 'mock-jwt-token',
        })
      )
    }

    return res(ctx.delay(500), ctx.status(401), ctx.json({ message: 'Invalid credentials' }))
  }),

  rest.post('/api/auth/register', (req, res, ctx) => {
    const { email, name } = req.body as any

    const newUser = {
      id: String(users.length + 1),
      name,
      email,
      avatarUrl: '',
    }

    users.push(newUser)

    return res(
      ctx.delay(500),
      ctx.json({
        user: newUser,
        token: 'mock-jwt-token',
      })
    )
  }),

  // Projects endpoints
  rest.get('/api/projects', (req, res, ctx) => {
    return res(ctx.delay(300), ctx.json(projects))
  }),

  rest.post('/api/projects', (req, res, ctx) => {
    const { name, description } = req.body as any

    const newProject = {
      id: String(projects.length + 1),
      name,
      description,
      ownerId: '1',
      members: [{ userId: '1', role: 'owner' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    projects.push(newProject)

    return res(ctx.delay(500), ctx.json(newProject))
  }),

  // Tasks endpoints
  rest.get('/api/projects/:projectId/tasks', (req, res, ctx) => {
    const { projectId } = req.params
    const projectTasks = tasks.filter(task => task.projectId === projectId)

    return res(ctx.delay(300), ctx.json(projectTasks))
  }),

  rest.post('/api/projects/:projectId/tasks', (req, res, ctx) => {
    const { projectId } = req.params
    const { title, description, assigneeId, dueDate, status } = req.body as any

    const newTask = {
      id: String(tasks.length + 1),
      projectId: projectId as string,
      title,
      description,
      assigneeId,
      dueDate,
      status: status || 'todo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    tasks.push(newTask)

    return res(ctx.delay(500), ctx.json(newTask))
  }),
]
