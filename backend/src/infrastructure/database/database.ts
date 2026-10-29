import mongoose from 'mongoose';
import { config } from '@/config';
import logger from '@/utils/logger';

class Database {
  private static instance: Database;
  private connection: typeof mongoose | null = null;

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connect(): Promise<void> {
    try {
      const mongoUri = config.NODE_ENV === 'test' ? config.MONGODB_TEST_URI : config.MONGODB_URI;

      this.connection = await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      logger.info(
        `MongoDB connected: host=${this.connection.connection.host} database=${this.connection.connection.name}`
      );

      // Handle connection events
      mongoose.connection.on('error', error => {
        logger.error('MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });

      // Handle process termination
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });
    } catch (error) {
      logger.error('Database connection failed:', error);
      process.exit(1);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connection) {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    }
  }

  public getConnection(): typeof mongoose | null {
    return this.connection;
  }

  public async clearDatabase(): Promise<void> {
    if (config.NODE_ENV === 'test') {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
    }
  }
}

export default Database;
