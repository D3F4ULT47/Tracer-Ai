import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';

mongoose.set('strictQuery', true);

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
  });
  logger.info('MongoDB connection established');
  return mongoose.connection;
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function getMongoHealth() {
  return {
    status: mongoose.connection.readyState === 1 ? 'ready' : 'not_ready',
    readyState: mongoose.connection.readyState,
  };
}
