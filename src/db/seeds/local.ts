import { closeDbConnection } from '../client';
import { seedUsers } from './shared';

try {
  await seedUsers('local');
} finally {
  await closeDbConnection();
}
