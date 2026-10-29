// MongoDB initialization script
db = db.getSiblingDB('synergysphere');

db.createUser({
  user: 'synergysphere',
  pwd: 'password123',
  roles: [
    {
      role: 'readWrite',
      db: 'synergysphere'
    }
  ]
});

// Create collections with initial data
db.createCollection('users');
db.createCollection('projects');
db.createCollection('tasks');
db.createCollection('threads');
db.createCollection('replies');
db.createCollection('notifications');
