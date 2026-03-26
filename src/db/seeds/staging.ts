import { closeDbConnection } from '../client';
import { seedUsers } from './shared';

try {
  await seedUsers('staging');
} finally {
  await closeDbConnection();
}
