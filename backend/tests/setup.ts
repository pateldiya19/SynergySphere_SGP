import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer;

/**
 * Setup test database before all tests
 */
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

/**
 * Cleanup after all tests
 */
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

/**
 * Clear database before each test
 */
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

/**
 * Global test timeout
 */
jest.setTimeout(30000);
