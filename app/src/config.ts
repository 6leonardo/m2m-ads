import { config } from 'dotenv';

// Load environment variables from .env file
config();

// Export configuration
export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  ADDRESS: process.env.ADDRESS || '0.0.0.0',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/mydb',
  PUBLIC_URL: process.env.PUBLIC_URL || ''
};