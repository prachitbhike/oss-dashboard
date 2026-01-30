import profileData from '@/config/profile.json';

export interface UserProfile {
  name: string;
  firm: string;
  role: string;
  email: string;
  focusAreas: string[];
  signature: string;
}

export function getProfile(): UserProfile {
  return profileData as UserProfile;
}
