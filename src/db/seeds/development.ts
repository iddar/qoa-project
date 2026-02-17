import { closeDbConnection } from '../client';
import { seedUsers } from './shared';

try {
  await seedUsers('development');
} finally {
  await closeDbConnection();
}
