import bcrypt from 'bcryptjs';
import { env } from '../../config/environment.js';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(env.PASSWORD_SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
