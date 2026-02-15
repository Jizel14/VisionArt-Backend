export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  phoneNumber: string | null;
  website: string | null;
}
