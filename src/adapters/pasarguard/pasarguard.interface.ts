export interface IPasarGuardClient {
  login(): Promise<void>;
  createUser(params: CreateUserParams): Promise<PasarGuardUser>;
  getUser(username: string): Promise<PasarGuardUser | null>;
  modifyUser(username: string, params: ModifyUserParams): Promise<PasarGuardUser>;
  deleteUser(username: string): Promise<void>;
  resetUserTraffic(username: string): Promise<PasarGuardUser>;
  getUserUsed(username: string): Promise<{ usedBytes: bigint }>;
  listGroups(): Promise<Array<{ id: number; name: string }>>;
}

export type CreateUserParams = {
  username: string;
  dataLimitBytes: bigint;
  expireAt: Date | null;
};

export type ModifyUserParams = {
  dataLimitBytes?: bigint;
  expireAt?: Date | null;
  status?: 'active' | 'disabled';
};

export type PasarGuardUser = {
  id: number;
  username: string;
  status: 'active' | 'disabled' | 'limited' | 'expired' | 'on_hold';
  usedTrafficBytes: bigint;
  dataLimitBytes: bigint;
  expireAt: Date | null;
  subscriptionUrl: string;
  createdAt: Date;
};
