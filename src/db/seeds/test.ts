import { closeDbConnection } from '../client';
import { seedUsers } from './shared';

try {
  await seedUsers('test');
} finally {
  await closeDbConnection();
}
