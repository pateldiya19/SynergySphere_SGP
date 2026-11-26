import bcrypt from 'bcryptjs';
import { User } from '../../src/app/models';
import { JWTUtils } from '../../src/core/utils/jwt';

let testPasswordHash: Promise<string> | undefined;

export async function createVerifiedTestUser(user: {
  name: string;
  email: string;
  password: string;
}) {
  if (!testPasswordHash) {
    testPasswordHash = bcrypt.hash(user.password, 12);
  }

  const [document] = await User.insertMany([
    { ...user, password: await testPasswordHash, isEmailVerified: true },
  ]);

  return {
    body: {
      data: {
        user: { ...document.getPublicProfile(), _id: String(document._id) },
        accessToken: JWTUtils.generateAccessToken({
          userId: String(document._id),
          email: document.email,
        }),
      },
    },
  };
}
